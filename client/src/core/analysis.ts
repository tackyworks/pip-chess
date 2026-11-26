import { epd, legalMoves, position } from './chess.ts'
import { evals, games } from './db.ts'
import { inBook, parseGame } from './pgn.ts'
import { GRID, REVIEW_VERSION, buildReview } from './coach/review.ts'
import { addMistakeCards } from './train.ts'
import { toModel } from './scale.ts'
import type { Pool } from './engine/pool.ts'
import type { HumanQuery, HumanView, Maia } from './maia.ts'
import type { Color, Line, ServerEvent } from '../../../shared/types.ts'

const QUICK = 60_000
const SCAN = 320_000
const VERIFY = 2_400_000
const MULTIPV = 2
const ROUNDS = 2

type Emit = (event: ServerEvent) => void

export class Analyzer {
  #pool: Pool
  #maia: Maia | null
  #emit: Emit
  #queue: { id: string; priority: number }[] = []
  #active = new Map<string, number>()
  #epoch = 0
  onReviewed: (() => void) | null = null

  constructor(pool: Pool, maia: Maia | null, emit: Emit) {
    this.#pool = pool
    this.#maia = maia
    this.#emit = emit
  }

  reset() {
    this.#epoch++
    this.#queue = []
    this.#active.clear()
  }

  get busy() {
    return this.#active.size + this.#queue.length
  }

  enqueue(ids: string[], priority = 1) {
    for (const id of ids) {
      if (this.#active.has(id)) {
        this.#active.set(id, Math.max(this.#active.get(id)!, priority))
        this.#pool.prioritize(id, priority)
        continue
      }
      const queued = this.#queue.find(q => q.id === id)
      if (queued) queued.priority = Math.max(queued.priority, priority)
      else {
        this.#queue.push({ id, priority })
        games.status(id, 'queued')
        this.#emit({ type: 'status', id, status: 'queued' })
      }
    }
    this.#queue.sort((a, b) => b.priority - a.priority)
    this.#pump()
  }

  #pump() {
    while (this.#queue.length) {
      const urgent = this.#queue[0].priority >= 5
      if (this.#active.size >= (urgent ? 3 : 2)) return
      const { id, priority } = this.#queue.shift()!
      this.#active.set(id, priority)
      void this.#run(id).finally(() => {
        this.#active.delete(id)
        this.#pump()
      })
    }
  }

  async #run(id: string) {
    const epoch = this.#epoch
    try {
      games.status(id, 'analyzing')
      this.#emit({ type: 'status', id, status: 'analyzing' })
      const { accuracy, perf } = await this.#analyze(id, () => epoch === this.#epoch)
      this.#emit({ type: 'reviewed', id, accuracy, perf })
      this.onReviewed?.()
    } catch (error) {
      if (epoch !== this.#epoch) return
      console.error(`analysis failed for ${id}:`, error)
      games.status(id, 'error')
      this.#emit({ type: 'status', id, status: 'error' })
    }
  }

  async #analyze(id: string, live: () => boolean) {
    const record = games.get(id)
    if (!record) throw new Error('game not found')
    const parsed = parseGame(record.pgn)
    if (!parsed) throw new Error('unreadable pgn')
    const { game } = record
    const fens = [parsed.start, ...parsed.moves.map(m => m.fen)]
    const positions = fens.map(position)
    const terminal = positions.map(p => p.isEnd())
    const lines: Line[][] = fens.map(() => [])
    const depthOf = new Array<number>(fens.length).fill(0)
    const priority = () => this.#active.get(id) ?? 1

    const stmEp = (i: number) => (positions[i].isCheckmate() ? 0 : terminal[i] ? 0.5 : lines[i][0]?.ep ?? 0.5)
    const white = (i: number) => (positions[i].turn === 'white' ? stmEp(i) : 1 - stmEp(i))

    const search = async (indices: number[], nodes: number, stage: 'quick' | 'scan' | 'verify') => {
      const todo: number[] = []
      for (const i of new Set(indices)) {
        if (terminal[i]) continue
        const hit = evals.get(`${epd(fens[i])}|${MULTIPV}`, nodes)
        if (hit) {
          lines[i] = hit
          depthOf[i] = nodes
          if (stage !== 'verify') this.#emit({ type: 'eval', id, ply: i, white: white(i) })
        } else todo.push(i)
      }
      let done = 0
      await this.#pool.run(
        todo.map(i => fens[i]),
        {
          nodes,
          multipv: MULTIPV,
          priority: priority(),
          group: id,
          onResult: (k, result) => {
            const i = todo[k]
            lines[i] = result
            depthOf[i] = nodes
            evals.put(`${epd(fens[i])}|${MULTIPV}`, nodes, result)
            this.#emit({ type: 'progress', id, done: ++done, total: todo.length, stage })
            if (stage !== 'verify') this.#emit({ type: 'eval', id, ply: i, white: white(i) })
          },
        },
      )
    }

    const ratings: Record<Color, number> = { white: game.white.rating || 1500, black: game.black.rating || 1500 }
    let people: Awaited<ReturnType<typeof humans>> | null = null
    const humans = async () => {
      const human: (HumanView | null)[] = new Array(parsed.moves.length).fill(null)
      const sweepCount: Record<Color, number> = { white: 0, black: 0 }
      if (!this.#maia) return { human, sweep: null, sweepCount }
      this.#emit({ type: 'progress', id, done: 0, total: 1, stage: 'human' })
      const queries: HumanQuery[] = []
      const sweepAt: { i: number; color: Color }[] = []
      parsed.moves.forEach((m, i) => {
        const mover = positions[i].turn
        const elo = toModel(ratings[mover])
        const oppo = toModel(ratings[mover === 'white' ? 'black' : 'white'])
        queries.push({ fen: fens[i], elo, oppo })
        const trivial = legalMoves(positions[i]).length === 1 || (i < 30 && inBook(m.fen))
        if (!trivial) {
          sweepAt.push({ i, color: mover })
          for (const e of GRID) queries.push({ fen: fens[i], elo: e, oppo })
        }
      })
      const views = await this.#maia.predict(queries)
      const sweep: Record<Color, number[]> = { white: GRID.map(() => 0), black: GRID.map(() => 0) }
      let k = 0
      parsed.moves.forEach((m, i) => {
        human[i] = views[k++]
        if (sweepAt[0]?.i !== i) return
        const { color } = sweepAt.shift()!
        sweepCount[color]++
        GRID.forEach((_, g) => {
          sweep[color][g] += Math.log(Math.max(views[k++].policy.get(m.uci) ?? 0, 1e-4))
        })
      })
      return { human, sweep, sweepCount }
    }
    const build = async () => {
      people ??= await humans()
      if (!live()) throw new Error('cancelled')
      this.#emit({ type: 'progress', id, done: 0, total: 1, stage: 'coach' })
      return buildReview({ parsed, lines, ...people, ratings, you: game.you, result: game.result })
    }

    if (priority() >= 5 && !record.review) {
      await search(fens.map((_, i) => i), QUICK, 'quick')
      games.draft(id, { ...(await build()), draft: true })
      this.#emit({ type: 'drafted', id })
    }

    await search(fens.map((_, i) => i), SCAN, 'scan')

    for (let round = 0; round < ROUNDS; round++) {
      const suspects: { i: number; weight: number }[] = []
      parsed.moves.forEach((m, i) => {
        const best = lines[i][0]
        if (!best) return
        const loss = best.uci === m.uci ? 0 : best.ep - (1 - stmEp(i + 1))
        const gap = lines[i].length > 1 ? best.ep - lines[i][1].ep : 0
        const swing = Math.abs(white(i + 1) - white(i))
        const weight = Math.max(loss, swing * 0.8, best.uci === m.uci && gap >= 0.12 ? gap * 0.6 : 0)
        if (weight >= 0.06 && (depthOf[i] < VERIFY || depthOf[i + 1] < VERIFY)) suspects.push({ i, weight })
      })
      if (!suspects.length) break
      const picked = suspects.sort((a, b) => b.weight - a.weight).slice(0, round === 0 ? 14 : 8)
      await search(picked.flatMap(s => [s.i, s.i + 1]), VERIFY, 'verify')
    }

    const review = await build()
    const mine = game.you ? review[game.you] : null
    games.review(id, review, mine?.accuracy ?? null, mine?.perf ?? null)
    if (game.you) addMistakeCards(id, review, lines, game.you, game.you === 'white' ? game.black.name : game.white.name)
    return { accuracy: mine?.accuracy ?? null, perf: mine?.perf ?? null, version: REVIEW_VERSION }
  }
}
