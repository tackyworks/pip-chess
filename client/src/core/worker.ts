import { closeAccount, games, openAccount, openStorage, settings, wipeAccount } from './db.ts'
import { Pool } from './engine/pool.ts'
import { Solo } from './engine/solo.ts'
import { Maia } from './maia.ts'
import { Analyzer } from './analysis.ts'
import { Openings } from './openings.ts'
import * as chesscom from './chesscom.ts'
import * as lichess from './lichess.ts'
import { insights, invalidateInsights } from './coach/insights.ts'
import { buildSession, puzzleRating, recordResult } from './train.ts'
import { position, sanLine, sanOf } from './chess.ts'
import { loadBook, parseGame } from './pgn.ts'
import { avatarOf } from './avatars.ts'
import { bump, streak } from './activity.ts'
import { REVIEW_VERSION } from './coach/review.ts'
import { ASSETS, HEAVY } from './assets.ts'
import { cachedBlobUrl, prune } from './download.ts'
import { setSite, toModel, type Site } from './scale.ts'
import type { Account, Color, Me, Result, ServerEvent } from '../../../shared/types.ts'

const AUTO_ANALYZE = 25

const post = (data: unknown) => (globalThis as unknown as { postMessage: (data: unknown) => void }).postMessage(data)
const emit = (event: ServerEvent) => post({ event })

interface Engines {
  pool: Pool
  solo: Solo
  maia: Maia | null
  analyzer: Analyzer
  openings: Openings
}

let engines: Promise<Engines> | null = null
let account: Account | null = null
let syncing: Promise<number> | null = null

const boot = () =>
  (engines ??= (async () => {
    const [glue, wasm, maia] = await Promise.all([
      cachedBlobUrl([ASSETS.engine], 'text/javascript'),
      cachedBlobUrl(ASSETS.engineParts, 'application/wasm', (done, total) => emit({ type: 'setup', what: 'engine', done, total })),
      Maia.load((done, total) => emit({ type: 'setup', what: 'model', done, total })).catch(error => {
        console.error('human model unavailable:', error)
        return null
      }),
    ])
    void prune(HEAVY)
    const engine = `${glue}#${encodeURIComponent(wasm)}`
    const [pool, solo] = await Promise.all([Pool.start(engine), Solo.start(engine)])
    const analyzer = new Analyzer(pool, maia, emit)
    analyzer.onReviewed = invalidateInsights
    emit({ type: 'setup', what: 'ready', done: 1, total: 1 })
    return { pool, solo, maia, analyzer, openings: new Openings(pool, maia, emit) }
  })())

const keyOf = (site: Site, username: string) => `${site}-${username.toLowerCase()}`

const accounts = () => settings.get<Account[]>('accounts', [])

const activate = (next: Account | null) => {
  if (account?.key === next?.key && account) return
  void engines?.then(({ pool, analyzer, openings }) => {
    analyzer.reset()
    openings.reset()
    pool.cancel()
  })
  syncing = null
  account = next
  settings.set('current', next?.key ?? null)
  if (!next) return closeAccount()
  setSite(next.site)
  openAccount(next.key)
  games.resetStuck()
  invalidateInsights()
}

const startSync = () => {
  if (!account || syncing) return
  const { site, username } = account
  const run = site === 'lichess' ? lichess.sync : chesscom.sync
  const owner = account
  const live = () => account === owner
  syncing = run(username, added => live() && emit({ type: 'syncing', added }), live)
    .then(async added => {
      if (!live()) return added
      emit({ type: 'synced', added })
      invalidateInsights()
      const { analyzer } = await boot()
      analyzer.enqueue(games.pending(AUTO_ANALYZE), 1)
      return added
    })
    .catch(error => {
      if (!live()) return 0
      emit({ type: 'synced', added: 0, error: (error as Error).message })
      return 0
    })
    .finally(() => {
      if (live()) syncing = null
    })
}

const me = (): Me => {
  if (!account) return { account: null, username: null, rating: null, puzzleRating: 1500, games: 0, analyzed: 0, streak: { days: 0, today: 0, goal: 3, best: 0 } }
  const counts = games.counts()
  return {
    account,
    username: account.username,
    rating: games.latestRating()?.rating ?? null,
    puzzleRating: puzzleRating(),
    games: counts.games,
    analyzed: counts.analyzed ?? 0,
    streak: streak(),
  }
}

const progress = () => {
  const before = streak()
  const after = bump()
  emit({ type: 'streak', streak: after, goalReached: before.today < after.goal && after.today >= after.goal })
}

const fail = (message: string): never => {
  throw new Error(message)
}

const legal = (fen: string) => {
  try {
    return position(fen)
  } catch {
    return fail('Illegal position')
  }
}

const colorOf = (value: string): Color => (value === 'white' || value === 'black' ? value : fail('Color must be white or black'))

const handlers = {
  me,
  accounts,
  async signIn(site: Site, raw: string) {
    const username = raw.trim()
    if (!/^[\w-]{2,30}$/.test(username)) fail(`That does not look like a ${site === 'lichess' ? 'Lichess' : 'chess.com'} username`)
    if (site === 'lichess') await lichess.exists(username)
    else await chesscom.exists(username)
    const key = keyOf(site, username)
    const next: Account = { key, site, username }
    settings.set('accounts', [next, ...accounts().filter(a => a.key !== key)])
    activate(next)
    games.claim(username)
    startSync()
    void boot()
    return me()
  },
  signOut() {
    activate(null)
    return me()
  },
  forget(key: string) {
    const target = accounts().find(a => a.key === key)
    if (!target) return accounts()
    activate(target)
    wipeAccount()
    activate(null)
    settings.set('accounts', accounts().filter(a => a.key !== key))
    return accounts()
  },
  sync() {
    startSync()
    return { syncing: true }
  },
  games: () => (account ? games.list(300, 0) : []),
  async game(id: string) {
    const record = games.get(id) ?? fail('Game not found')
    if (record.review && record.review.version < REVIEW_VERSION) void boot().then(e => e.analyzer.enqueue([id], 6))
    const parsed = parseGame(record.pgn)
    const line = { start: parsed?.start ?? '', moves: parsed?.moves.map(({ san, uci, fen, clock }) => ({ san, uci, fen, clock })) ?? [] }
    return { game: record.game, review: record.review, line }
  },
  async analyze(id: string) {
    const { analyzer } = await boot()
    analyzer.enqueue([id], 6)
    return { queued: true }
  },
  async analyzeMore(count: number) {
    const ids = games.pending(Math.min(100, count || 20))
    const { analyzer } = await boot()
    analyzer.enqueue(ids, 1)
    return { queued: ids.length }
  },
  async importPgn(pgn: string, timeClass?: 'pip') {
    const game = chesscom.toNewGame(pgn, { you: account?.username ?? null, timeClass }) ?? fail('Could not read that PGN')
    games.insert([game])
    if (timeClass) progress()
    const { analyzer } = await boot()
    analyzer.enqueue([game.id], 6)
    return { id: game.id }
  },
  activity() {
    progress()
    return streak()
  },
  insights: (tc?: string) => insights(tc),
  train: (theme?: string) => buildSession(insights().focus, theme),
  result(id: string, result: Result) {
    progress()
    return recordResult(id, result)
  },
  async openings() {
    const { openings } = await boot()
    return { white: openings.summary('white'), black: openings.summary('black') }
  },
  async repertoire(color: string) {
    const { openings } = await boot()
    return { tree: openings.tree(colorOf(color)) }
  },
  async drill(color: string, all: boolean) {
    const { openings } = await boot()
    return { lines: openings.drill(colorOf(color), all) }
  },
  async openingResult(id: string, result: Result) {
    progress()
    const { openings } = await boot()
    return openings.record(id, result)
  },
  async evaluate(fen: string) {
    const pos = legal(fen)
    if (pos.isEnd()) return { lines: [] }
    const { solo } = await boot()
    const lines = await solo.search({ fen, nodes: 450_000, multipv: 3 })
    const flip = pos.turn === 'white' ? 1 : -1
    return {
      lines: lines.map(l => ({
        uci: l.uci,
        san: sanOf(pos, l.uci),
        line: sanLine(fen, l.pv, 6),
        white: pos.turn === 'white' ? l.ep : 1 - l.ep,
        cp: l.cp === undefined ? null : l.cp * flip,
        mate: l.mate === undefined ? null : l.mate * flip,
      })),
    }
  },
  async spar(fen: string, elo: number, mode: 'maia' | 'engine') {
    const pos = legal(fen)
    if (pos.isEnd()) return { uci: null }
    const { solo, maia } = await boot()
    if (mode === 'engine' || !maia) {
      const lines = await solo.search({ fen, nodes: 900_000, multipv: 1 })
      return { uci: lines[0]?.uci ?? null }
    }
    const strength = toModel(elo || 1500)
    const [view] = await maia.predict([{ fen, elo: strength, oppo: strength }])
    const options = [...view.policy].filter(([, p]) => p >= 0.04).map(([uci, p]) => [uci, p ** 1.4] as const)
    const total = options.reduce((a, [, w]) => a + w, 0)
    let roll = Math.random() * total
    for (const [uci, w] of options) if ((roll -= w) <= 0) return { uci }
    return { uci: options[0]?.[0] ?? [...view.policy.keys()][0] }
  },
  avatar: (name: string) => avatarOf(name),
  async warmup() {
    await boot()
    return true
  },
}

export type Handlers = typeof handlers
export type Method = keyof Handlers

const ready = (async () => {
  await Promise.all([openStorage(), loadBook()])
  const current = settings.get<string | null>('current', null)
  const found = accounts().find(a => a.key === current) ?? null
  activate(found)
  if (found) {
    startSync()
    void boot().then(({ analyzer }) => analyzer.enqueue(games.outdated(REVIEW_VERSION), 0))
  }
})()

globalThis.onmessage = async (e: MessageEvent<{ id: number; method: Method; args: unknown[] }>) => {
  const { id, method, args } = e.data
  try {
    await ready
    const handler = handlers[method] as (...a: unknown[]) => unknown
    post({ id, result: await handler(...args) })
  } catch (error) {
    post({ id, error: (error as Error).message })
  }
}

