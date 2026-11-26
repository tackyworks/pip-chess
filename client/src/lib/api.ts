import type { Handlers, Method } from '../core/worker.ts'
import type { Color, Result, ServerEvent } from '../../../shared/types.ts'
import type { Site } from '../core/scale.ts'

export interface EvalLine {
  uci: string
  san: string
  line: string[]
  white: number
  cp: number | null
  mate: number | null
}

type Reply = { id: number; result?: unknown; error?: string } | { event: ServerEvent }

const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
const listeners = new Set<(event: ServerEvent) => void>()
let worker: Worker | null = null
let seq = 0

const receive = (e: MessageEvent<Reply>) => {
  const data = e.data
  if ('event' in data) {
    for (const listener of listeners) listener(data.event)
    return
  }
  const waiter = pending.get(data.id)
  if (!waiter) return
  pending.delete(data.id)
  if (data.error !== undefined) waiter.reject(new Error(data.error))
  else waiter.resolve(data.result)
}

const core = () => {
  if (worker) return worker
  worker = new Worker(new URL('../core/worker.ts', import.meta.url), { type: 'module', name: 'pip-core' })
  worker.onmessage = receive
  return worker
}

export const shutdown = () => {
  worker?.terminate()
  worker = null
  for (const waiter of pending.values()) waiter.reject(new Error('Pip moved to another tab'))
  pending.clear()
}

const call = <M extends Method>(method: M, ...args: Parameters<Handlers[M]>) =>
  new Promise<Awaited<ReturnType<Handlers[M]>>>((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    core().postMessage({ id, method, args })
  })

export const api = {
  me: () => call('me'),
  accounts: () => call('accounts'),
  signIn: (site: Site, username: string) => call('signIn', site, username),
  signOut: () => call('signOut'),
  forget: (key: string) => call('forget', key),
  sync: () => call('sync'),
  games: () => call('games'),
  game: (id: string) => call('game', id),
  analyze: (id: string) => call('analyze', id),
  analyzeMore: (count: number) => call('analyzeMore', count),
  importPgn: (pgn: string, timeClass?: 'pip') => call('importPgn', pgn, timeClass),
  activity: () => call('activity'),
  insights: (tc?: string) => call('insights', tc),
  train: (theme?: string) => call('train', theme),
  result: (id: string, result: Result) => call('result', id, result),
  openings: () => call('openings'),
  repertoire: (color: Color) => call('repertoire', color),
  drill: (color: Color, all: boolean) => call('drill', color, all),
  openingResult: (id: string, result: Result) => call('openingResult', id, result),
  evaluate: (fen: string) => call('evaluate', fen) as Promise<{ lines: EvalLine[] }>,
  spar: (fen: string, elo: number, mode: 'maia' | 'engine') => call('spar', fen, elo, mode),
  avatar: (name: string) => call('avatar', name),
  warmup: () => call('warmup'),
}

export const listen = (handler: (event: ServerEvent) => void) => {
  listeners.add(handler)
  return () => listeners.delete(handler)
}
