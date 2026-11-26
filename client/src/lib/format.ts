import type { Color, GameRow } from '../../../shared/types.ts'

export const evalText = (cp: number | null, mate: number | null) => {
  if (mate !== null) return mate === 0 ? '#' : `M${Math.abs(mate)}`
  if (cp === null) return ''
  const v = Math.abs(cp / 100)
  return v >= 10 ? v.toFixed(0) : v.toFixed(1)
}

export const outcome = (game: GameRow): 'win' | 'loss' | 'draw' | null => {
  if (!game.you) return null
  if (game.result === '1/2-1/2') return 'draw'
  return game.result === (game.you === 'white' ? '1-0' : '0-1') ? 'win' : 'loss'
}

export const opponent = (game: GameRow) => (game.you === 'black' ? game.white : game.black)
export const mine = (game: GameRow) => (game.you === 'black' ? game.black : game.white)

export const dayLabel = (seconds: number) => {
  const d = new Date(seconds * 1000)
  const today = new Date()
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export const moveNo = (ply: number, color: Color) => `${Math.ceil(ply / 2)}${color === 'white' ? '.' : '…'}`

export const clock = (s: number | null) => {
  if (s === null) return ''
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

export const pct = (x: number) => `${Math.round(x * 100)}%`
