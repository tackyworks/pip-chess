import { meta } from './db.ts'
import type { Streak } from '../../../shared/types.ts'

const GOAL = 3
const DAY = 86_400_000
const KEEP_DAYS = 400

const dayOf = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const read = () => meta.get<Record<string, number>>('activity', {})

export const streak = (): Streak => {
  const log = read()
  const now = Date.now()
  const today = log[dayOf(now)] ?? 0
  let days = 0
  for (let t = today ? now : now - DAY; log[dayOf(t)]; t -= DAY) days++
  let best = 0
  let run = 0
  let previous = 0
  for (const key of Object.keys(log).sort()) {
    const t = new Date(`${key}T12:00:00`).getTime()
    run = previous && Math.round((t - previous) / DAY) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = t
  }
  return { days, today, goal: GOAL, best }
}

export const bump = () => {
  const log = read()
  const now = Date.now()
  const key = dayOf(now)
  log[key] = (log[key] ?? 0) + 1
  const oldest = dayOf(now - KEEP_DAYS * DAY)
  for (const k of Object.keys(log)) if (k < oldest) delete log[k]
  meta.set('activity', log)
  return streak()
}
