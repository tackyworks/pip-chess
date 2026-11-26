const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]
const DECAY = -0.5
const FACTOR = 19 / 81
const DAY = 86_400_000
const RELEARN = 10 * 60_000

export type Grade = 1 | 2 | 3 | 4

export interface Memory {
  stability: number
  difficulty: number
  reps: number
  lapses: number
  last: number | null
}

const clamp = (d: number) => Math.min(10, Math.max(1, d))
const initialDifficulty = (g: Grade) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1)

export const retrievability = (days: number, stability: number) => (1 + (FACTOR * days) / stability) ** DECAY

const nextDifficulty = (d: number, g: Grade) => {
  const step = d - W[6] * (g - 3)
  return clamp(W[7] * initialDifficulty(4) + (1 - W[7]) * (d + ((step - d) * (10 - d)) / 9))
}

const nextStability = ({ stability: s, difficulty: d }: Memory, g: Grade, days: number) => {
  if (days < 1) return s * Math.exp(W[17] * (g - 3 + W[18]))
  const r = retrievability(days, s)
  if (g === 1) return Math.min(s, W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r)))
  const bonus = g === 2 ? W[15] : g === 4 ? W[16] : 1
  return s * (1 + Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1) * bonus)
}

export const schedule = (memory: Memory, g: Grade, now: number, retention = 0.9) => {
  const fresh = memory.reps === 0 || memory.last === null
  const stability = fresh ? W[g - 1] : nextStability(memory, g, (now - (memory.last ?? now)) / DAY)
  const difficulty = fresh ? initialDifficulty(g) : nextDifficulty(memory.difficulty, g)
  const days = Math.max(1, Math.round((stability / FACTOR) * (retention ** (1 / DECAY) - 1)))
  return {
    stability,
    difficulty,
    reps: memory.reps + 1,
    lapses: memory.lapses + (g === 1 ? 1 : 0),
    last: now,
    due: now + (g === 1 ? RELEARN : days * DAY),
  }
}

export const grade = (solved: boolean, hints: number, ms: number): Grade =>
  !solved ? 1 : hints > 0 ? 2 : ms < 9000 ? 4 : 3
