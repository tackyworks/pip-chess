import { players } from './db.ts'
import { site } from './scale.ts'

const RETRY_AFTER = 7 * 86_400_000
const LANES = 3

const inflight = new Map<string, Promise<string | null>>()
const waiting: (() => void)[] = []
let running = 0

const slot = async <T>(work: () => Promise<T>) => {
  if (running >= LANES) await new Promise<void>(resolve => waiting.push(resolve))
  running++
  try {
    return await work()
  } finally {
    running--
    waiting.shift()?.()
  }
}

const lookup = async (name: string) => {
  const res = await fetch(`https://api.chess.com/pub/player/${name}`)
  const avatar = res.ok ? ((await res.json()) as { avatar?: string }).avatar : undefined
  const url = avatar?.startsWith('https://') ? avatar : null
  if (res.ok || res.status === 404) players.put(name, url)
  return url
}

export const avatarOf = (raw: string): Promise<string | null> => {
  const name = raw.toLowerCase()
  if (site() !== 'chesscom' || !/^[\w-]{2,30}$/.test(name)) return Promise.resolve(null)
  const known = players.get(name)
  if (known && (known.url || Date.now() - known.fetched < RETRY_AFTER)) return Promise.resolve(known.url)
  let job = inflight.get(name)
  if (!job) {
    job = slot(() => lookup(name))
      .catch(() => null)
      .finally(() => inflight.delete(name))
    inflight.set(name, job)
  }
  return job
}
