import { epd, fenOf, moveOf, position, sanOf } from './chess.ts'
import { evals, games, openingCards, repertoires } from './db.ts'
import { inBook, parseGame } from './pgn.ts'
import { grade, schedule } from '../../../shared/fsrs.ts'
import { toModel } from './scale.ts'
import type { Pool } from './engine/pool.ts'
import type { HumanView, Maia } from './maia.ts'
import type { Color, DrillLine, DrillStep, Line, RepMove, RepNode, RepSummary, Repertoire, Result, ServerEvent } from '../../../shared/types.ts'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MAX_PLY = 20
const MIN_GAMES = 2
const DEEP = 900_000
const SHALLOW = 320_000
const KEEP = 0.05
const KEEP_BOOK = 0.09
const VERSION = 2
const NEAR = 0.025
const ACCEPT = 0.015
const PREP = 18
const THEORY_ELO = 2200

interface Draft {
  key: string
  fen: string
  ply: number
  mine: boolean
  games: number
  points: number
  moves: Map<string, { uci: string; san: string; games: number; points: number; to: string; prep: boolean }>
  prep: boolean
}

type Emit = (event: ServerEvent) => void

const scoreFor = (result: string, color: Color) => (result === '1/2-1/2' ? 0.5 : result === (color === 'white' ? '1-0' : '0-1') ? 1 : 0)
const after = (fen: string, uci: string) => {
  const pos = position(fen)
  pos.play(moveOf(uci))
  return fenOf(pos)
}
const whiteEp = (fen: string, lines: Line[] | null) => (lines?.[0] ? (fen.split(' ')[1] === 'w' ? lines[0].ep : 1 - lines[0].ep) : null)
const round = (x: number) => Math.round(x * 1000) / 1000
const likeliest = (view: HumanView | undefined) => (view ? [...view.policy].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined)

export class Openings {
  #pool: Pool
  #maia: Maia | null
  #emit: Emit
  #jobs = new Map<Color, Promise<void>>()
  #progress = new Map<Color, { done: number; total: number }>()
  #cache = new Map<Color, { stamp: string; rep: Repertoire }>()

  constructor(pool: Pool, maia: Maia | null, emit: Emit) {
    this.#pool = pool
    this.#maia = maia
    this.#emit = emit
  }

  #stored(color: Color) {
    const hit = this.#cache.get(color)
    if (hit) return hit
    const row = repertoires.get(color)
    if (!row) return null
    const value = { stamp: row.stamp, rep: JSON.parse(row.data) as Repertoire }
    this.#cache.set(color, value)
    return value
  }

  #ensure(color: Color) {
    const stamp = `${VERSION}:${games.stampFor(color)}`
    const stored = this.#stored(color)
    if (stamp.endsWith(':0:0')) return
    if (stored?.stamp === stamp || this.#jobs.has(color)) return
    const job = this.#build(color, stamp)
      .catch(error => console.error(`repertoire build failed (${color}):`, error))
      .finally(() => {
        this.#jobs.delete(color)
        this.#progress.delete(color)
        this.#emit({ type: 'repertoire', color, status: 'ready', done: 1, total: 1 })
      })
    this.#jobs.set(color, job)
  }

  reset() {
    this.#cache.clear()
    this.#progress.clear()
  }

  summary(color: Color): RepSummary {
    this.#ensure(color)
    const rep = this.#stored(color)?.rep
    const counts = openingCards.counts(color, Date.now())
    return {
      color,
      status: this.#jobs.has(color) ? 'building' : rep ? 'ready' : 'empty',
      games: rep?.games ?? 0,
      score: rep?.score ?? null,
      positions: counts.positions,
      fixes: counts.fixes,
      due: counts.due,
      line: rep ? mainLine(rep) : [],
      progress: this.#progress.get(color) ?? null,
    }
  }

  tree(color: Color) {
    this.#ensure(color)
    return this.#stored(color)?.rep ?? null
  }

  drill(color: Color, all: boolean, limit = 8): DrillLine[] {
    const rep = this.#stored(color)?.rep
    if (!rep) return []
    const now = Date.now()
    const due = openingCards.dueSet(color, now)
    const paths = pathsOf(rep)
    const picked = openingCards.list(color, now, !all, limit * 3)
    const lines: DrillLine[] = []
    const covered = new Set<string>()
    for (const card of picked) {
      if (lines.length >= limit || covered.has(card.id)) continue
      const key = card.id.slice(color.length + 1)
      const path = paths.get(key)
      const node = rep.nodes[key]
      if (!path || !node?.pick) continue
      const steps: DrillStep[] = [...path, { key, uci: node.pick.uci }].map(({ key: at, uci }) => {
        const n = rep.nodes[at]
        const id = n.mine ? `${color}:${at}` : null
        if (id) covered.add(id)
        return {
          uci,
          san: sanOf(position(n.fen), uci),
          mine: n.mine,
          id,
          due: id !== null && due.has(id),
          accept: n.mine && n.pick ? n.pick.accept : [],
        }
      })
      lines.push({ id: card.id, fix: card.fix === 1, opening: lastOpening(rep, [...path.map(p => p.key), key]), steps })
    }
    return lines
  }

  record(id: string, result: Result) {
    const memory = openingCards.memory(id)
    if (!memory) return { ok: false }
    openingCards.update(id, schedule(memory, grade(result.solved, result.hints, result.ms), Date.now()))
    return { ok: true }
  }

  async #search(color: Color, fens: string[], nodes: number, multipv: number) {
    const out = new Map<string, Line[]>()
    const todo: string[] = []
    for (const fen of new Set(fens)) {
      const hit = evals.get(`${epd(fen)}|${multipv}`, nodes)
      if (hit) out.set(fen, hit)
      else todo.push(fen)
    }
    const progress = this.#progress.get(color) ?? { done: 0, total: 0 }
    progress.total += todo.length
    this.#progress.set(color, progress)
    await this.#pool.run(todo, {
      nodes,
      multipv,
      priority: 4,
      group: `rep:${color}`,
      onResult: (i, lines) => {
        out.set(todo[i], lines)
        evals.put(`${epd(todo[i])}|${multipv}`, nodes, lines)
        progress.done++
        this.#emit({ type: 'repertoire', color, status: 'building', done: progress.done, total: progress.total })
      },
    })
    return out
  }

  async #human(fens: string[], elo: number) {
    const out = new Map<string, HumanView>()
    if (!this.#maia || !fens.length) return out
    const views = await this.#maia.predict(fens.map(fen => ({ fen, elo, oppo: elo })))
    fens.forEach((fen, i) => out.set(fen, views[i]))
    return out
  }

  async #build(color: Color, stamp: string) {
    this.#progress.set(color, { done: 0, total: 0 })
    this.#emit({ type: 'repertoire', color, status: 'building', done: 0, total: 0 })
    const rows = games.byColor(color, 400)
    const drafts = new Map<string, Draft>()
    const node = (fen: string, ply: number, prep = false) => {
      const key = epd(fen)
      let d = drafts.get(key)
      if (!d) drafts.set(key, (d = { key, fen, ply, mine: (fen.split(' ')[1] === 'w') === (color === 'white'), games: 0, points: 0, moves: new Map(), prep }))
      return d
    }
    let total = 0
    let points = 0
    for (const row of rows) {
      const parsed = parseGame(row.pgn)
      if (!parsed || epd(parsed.start) !== epd(START)) continue
      const score = scoreFor(row.result, color)
      total++
      points += score
      let fen = parsed.start
      parsed.moves.slice(0, MAX_PLY).forEach((m, ply) => {
        const d = node(fen, ply)
        d.games++
        d.points += score
        const mv = d.moves.get(m.uci) ?? { uci: m.uci, san: m.san, games: 0, points: 0, to: epd(m.fen), prep: false }
        mv.games++
        mv.points += score
        d.moves.set(m.uci, mv)
        fen = m.fen
      })
    }
    const rootKey = epd(START)
    for (const [key, d] of drafts) if (d.games < MIN_GAMES && key !== rootKey) drafts.delete(key)
    if (!drafts.has(rootKey)) return

    const rating = toModel(games.latestRating()?.rating ?? 1500)
    const picks = new Map<string, { uci: string; accept: string[]; fix: RepNode['fix'] }>()
    const lines = new Map<string, Line[]>()

    const decide = async (targets: Draft[]) => {
      const deep = await this.#search(color, targets.map(d => d.fen), DEEP, 3)
      const theory = await this.#human(targets.map(d => d.fen), THEORY_ELO)
      const needChild: string[] = []
      for (const d of targets) {
        const ls = deep.get(d.fen) ?? []
        lines.set(d.key, ls)
        const played = [...d.moves.values()].filter(m => !m.prep).sort((a, b) => b.games - a.games)[0]
        if (played && ls[0] && !ls.some(l => l.uci === played.uci)) needChild.push(after(d.fen, played.uci))
      }
      const shallow = await this.#search(color, needChild, SHALLOW, 2)
      for (const d of targets) {
        const ls = lines.get(d.key) ?? []
        const best = ls[0]
        if (!best) continue
        const played = [...d.moves.values()].filter(m => !m.prep).sort((a, b) => b.games - a.games)[0]
        const playedEp = played ? ls.find(l => l.uci === played.uci)?.ep ?? 1 - (shallow.get(after(d.fen, played.uci))?.[0]?.ep ?? 0.5) : 0
        const loss = played ? Math.max(0, best.ep - playedEp) : 1
        const tolerance = played && inBook(after(d.fen, played.uci)) ? KEEP_BOOK : KEEP
        let uci: string
        let pickEp: number
        if (played && loss <= tolerance) {
          uci = played.uci
          pickEp = playedEp
        } else {
          const near = ls.filter(l => l.ep >= best.ep - NEAR)
          const policy = theory.get(d.fen)?.policy
          const chosen =
            near.find(l => inBook(after(d.fen, l.uci))) ?? [...near].sort((a, b) => (policy?.get(b.uci) ?? 0) - (policy?.get(a.uci) ?? 0))[0] ?? best
          uci = chosen.uci
          pickEp = chosen.ep
        }
        picks.set(d.key, {
          uci,
          accept: [uci, ...ls.filter(l => l.uci !== uci && l.ep >= pickEp - ACCEPT).map(l => l.uci)],
          fix: played && uci !== played.uci ? { uci: played.uci, san: played.san, games: played.games, loss: round(loss) } : null,
        })
      }
    }

    const ensurePick = (d: Draft) => {
      const pick = picks.get(d.key)
      if (!pick || d.moves.has(pick.uci)) return
      d.moves.set(pick.uci, { uci: pick.uci, san: sanOf(position(d.fen), pick.uci), games: 0, points: 0, to: epd(after(d.fen, pick.uci)), prep: true })
    }

    await decide([...drafts.values()].filter(d => d.mine))

    const prepTargets: Draft[] = []
    const reach = (fen: string, ply: number) => {
      if (prepTargets.length >= PREP || ply >= MAX_PLY) return null
      const d = node(fen, ply, true)
      if (!picks.has(d.key) && !prepTargets.includes(d)) prepTargets.push(d)
      return d
    }
    const theirs = [...drafts.values()].filter(d => !d.mine && d.ply <= 12 && d.games >= 3)
    const fixed = [...drafts.values()].filter(d => d.mine && picks.get(d.key)?.fix)
    const fixedChildren = fixed.map(d => after(d.fen, picks.get(d.key)!.uci))
    const human = await this.#human([...theirs.map(d => d.fen), ...fixedChildren], rating)
    for (const [i, d] of fixed.entries()) {
      const child = fixedChildren[i]
      const reply = likeliest(human.get(child))
      if (drafts.has(epd(child)) || !reply) continue
      const next = after(child, reply)
      node(child, d.ply + 1, true).moves.set(reply, { uci: reply, san: sanOf(position(child), reply), games: 0, points: 0, to: epd(next), prep: true })
      reach(next, d.ply + 2)
    }
    for (const d of theirs) {
      const view = human.get(d.fen)
      if (!view) continue
      const fresh = [...view.policy].filter(([uci, p]) => p >= 0.18 && !d.moves.has(uci)).sort((a, b) => b[1] - a[1]).slice(0, 2)
      for (const [uci] of fresh) {
        const next = after(d.fen, uci)
        d.moves.set(uci, { uci, san: sanOf(position(d.fen), uci), games: 0, points: 0, to: epd(next), prep: true })
        reach(next, d.ply + 1)
      }
    }
    if (prepTargets.length) await decide(prepTargets)
    for (const d of drafts.values()) if (d.mine) ensurePick(d)

    const nodes: Record<string, RepNode> = {}
    const opponentEvals = await this.#search(color, [...drafts.values()].filter(d => !d.mine).map(d => d.fen), SHALLOW, 2)
    for (const d of drafts.values()) {
      const pick = picks.get(d.key)
      if (d.mine && !pick) continue
      const moves: RepMove[] = [...d.moves.values()]
        .map(m => ({ uci: m.uci, san: m.san, games: m.games, score: m.games ? round(m.points / m.games) : null, to: m.to, prep: m.prep }))
        .sort((a, b) => b.games - a.games)
      nodes[d.key] = {
        key: d.key,
        fen: d.fen,
        ply: d.ply,
        mine: d.mine,
        games: d.games,
        score: d.games ? round(d.points / d.games) : null,
        white: whiteEp(d.fen, d.mine ? lines.get(d.key) ?? null : opponentEvals.get(d.fen) ?? null),
        opening: inBook(d.fen)?.[1] ?? null,
        moves,
        pick: pick ? { uci: pick.uci, san: sanOf(position(d.fen), pick.uci), accept: pick.accept } : null,
        fix: pick?.fix ?? null,
        prep: d.prep,
      }
    }
    const rep: Repertoire = { color, root: rootKey, nodes, games: total, score: total ? round(points / total) : null, built: Date.now() }
    const reachable = pathsOf(rep)
    openingCards.sync(
      color,
      [...reachable.keys()]
        .map(key => nodes[key])
        .filter(n => n.mine && n.pick)
        .map(n => ({ id: `${color}:${n.key}`, move: n.pick!.uci, fix: n.fix !== null, games: n.games })),
    )
    repertoires.put(color, stamp, rep)
    this.#cache.set(color, { stamp, rep })
  }
}

const pathsOf = (rep: Repertoire) => {
  const paths = new Map<string, { key: string; uci: string }[]>([[rep.root, []]])
  const queue = [rep.root]
  while (queue.length) {
    const key = queue.shift()!
    const n = rep.nodes[key]
    if (!n) continue
    const options = n.mine ? (n.pick ? n.moves.filter(m => m.uci === n.pick!.uci) : []) : n.moves
    for (const m of options) {
      if (paths.has(m.to) || !rep.nodes[m.to]) continue
      paths.set(m.to, [...paths.get(key)!, { key, uci: m.uci }])
      queue.push(m.to)
    }
  }
  return paths
}

const mainLine = (rep: Repertoire) => {
  const out: string[] = []
  let n: RepNode | undefined = rep.nodes[rep.root]
  while (n && out.length < 10) {
    const move: { san: string; to: string } | undefined = n.mine ? (n.pick ? n.moves.find(m => m.uci === n!.pick!.uci) : undefined) : n.moves[0]
    if (!move) break
    out.push(move.san)
    n = rep.nodes[move.to]
  }
  return out
}

const lastOpening = (rep: Repertoire, keys: string[]) => {
  for (let i = keys.length - 1; i >= 0; i--) {
    const name = rep.nodes[keys[i]]?.opening
    if (name) return name
  }
  return null
}
