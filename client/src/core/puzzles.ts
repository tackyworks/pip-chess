import { ASSETS } from './assets.ts'

export interface PuzzleRow {
  id: string
  fen: string
  moves: string
  rating: number
  themes: string
}

type Packed = [string, string, string, number, string]

const shards = new Map<string, Promise<PuzzleRow[]>>()
const seen = new Map<string, PuzzleRow>()

const shard = (theme: string, bucket: number) => {
  const key = `${theme}/${bucket}`
  let job = shards.get(key)
  if (!job) {
    job = fetch(ASSETS.puzzles(theme, bucket))
      .then(r => (r.ok ? (r.json() as Promise<Packed[]>) : []))
      .then(rows => rows.map(([id, fen, moves, rating, themes]) => ({ id, fen, moves, rating, themes })))
      .catch(() => [])
    shards.set(key, job)
  }
  return job
}

export const byTheme = async (theme: string, low: number, high: number, limit: number) => {
  const buckets: number[] = []
  for (let b = Math.max(4, Math.floor(low / 100)); b <= Math.min(30, Math.floor(high / 100)); b++) buckets.push(b)
  const rows = (await Promise.all(buckets.map(b => shard(theme, b)))).flat().filter(p => p.rating >= low && p.rating <= high)
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
  }
  const picked = rows.slice(0, limit)
  for (const p of picked) seen.set(p.id, p)
  return picked
}

export const known = (id: string) => seen.get(id)
