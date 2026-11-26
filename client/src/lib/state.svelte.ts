import { api, listen } from './api.ts'
import { toast } from './toast.svelte.ts'
import type { GameRow, Me } from '../../../shared/types.ts'

export interface Progress {
  done: number
  total: number
  stage: 'quick' | 'scan' | 'verify' | 'human' | 'coach'
}

export const app = $state({
  me: null as Me | null,
  games: [] as GameRow[],
  loaded: false,
  syncing: false,
  syncError: null as string | null,
  progress: {} as Record<string, Progress>,
  live: {} as Record<string, Record<number, number>>,
  reviewed: {} as Record<string, number>,
  repertoire: { white: 0, black: 0 } as Record<'white' | 'black', number>,
  wanted: new Set<string>(),
  building: { white: null, black: null } as Record<'white' | 'black', { done: number; total: number } | null>,
  setup: { engine: 0, model: 0, ready: false, active: false },
})

let pending: ReturnType<typeof setTimeout> | null = null
const reloadGames = () => {
  if (pending) return
  pending = setTimeout(async () => {
    pending = null
    app.games = await api.games()
  }, 400)
}

export const refresh = async () => {
  app.me = await api.me()
  app.games = app.me.username ? await api.games() : []
  app.loaded = true
}

const patch = (id: string, change: Partial<GameRow>) => {
  const game = app.games.find(g => g.id === id)
  if (game) Object.assign(game, change)
}

export const working = () => app.games.filter(g => g.status === 'analyzing' || g.status === 'queued').length

listen(event => {
  switch (event.type) {
    case 'status':
      patch(event.id, { status: event.status })
      break
    case 'progress':
      app.progress[event.id] = { done: event.done, total: event.total, stage: event.stage }
      break
    case 'eval':
      ;(app.live[event.id] ??= {})[event.ply] = event.white
      break
    case 'reviewed': {
      const game = app.games.find(g => g.id === event.id)
      if (app.wanted.has(event.id) && game && !location.pathname.includes(encodeURIComponent(event.id)))
        toast(`Review ready: vs ${game.you === 'black' ? game.white.name : game.black.name}`, 'good', `/game/${encodeURIComponent(event.id)}`)
      app.wanted.delete(event.id)
      patch(event.id, { status: 'done', accuracy: event.accuracy, perf: event.perf })
      delete app.progress[event.id]
      app.reviewed[event.id] = (app.reviewed[event.id] ?? 0) + 1
      if (app.me) app.me.analyzed++
      break
    }
    case 'drafted':
      app.reviewed[event.id] = (app.reviewed[event.id] ?? 0) + 1
      break
    case 'setup':
      app.setup.active = event.what !== 'ready'
      if (event.what === 'ready') app.setup.ready = true
      else app.setup[event.what] = event.total ? event.done / event.total : 0
      break
    case 'streak':
      if (app.me) app.me.streak = event.streak
      if (event.goalReached) toast(`Daily goal reached. ${event.streak.days} day streak!`, 'good')
      break
    case 'repertoire':
      app.building[event.color] = event.status === 'building' ? { done: event.done, total: event.total } : null
      if (event.status === 'ready') app.repertoire[event.color]++
      if (event.status === 'ready' && location.pathname.startsWith('/openings')) toast(`Your ${event.color} repertoire is up to date`, 'good')
      break
    case 'syncing':
      app.syncing = true
      reloadGames()
      break
    case 'synced':
      app.syncing = false
      app.syncError = event.error ?? null
      if (event.error) toast(event.error, 'bad')
      else if (event.added) toast(`${event.added} new game${event.added === 1 ? '' : 's'} synced`, 'good')
      reloadGames()
      void api.me().then(me => (app.me = me))
      break
  }
})

export const siteName = () => (app.me?.account?.site === 'lichess' ? 'Lichess' : 'chess.com')
