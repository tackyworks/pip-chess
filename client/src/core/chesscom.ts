import { games, meta, type NewGame } from './db.ts'
import { openingOf, parseGame } from './pgn.ts'
import type { Color } from '../../../shared/types.ts'

interface ApiPlayer {
  username: string
  rating: number
}

interface ApiGame {
  url: string
  pgn?: string
  time_control: string
  time_class: string
  end_time: number
  rules: string
  white: ApiPlayer
  black: ApiPlayer
}

const API = 'https://api.chess.com/pub/player'
const MONTHS = 12
const HEADERS = { accept: 'application/json' }

const getJson = async <T>(url: string): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS })
    if (res.ok) return (await res.json()) as T
    if (res.status === 404) throw new Error('Player not found on chess.com')
    if (attempt >= 3 || res.status < 429) throw new Error(`chess.com responded ${res.status}`)
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
  }
}

export const exists = async (username: string) => {
  const res = await fetch(`${API}/${encodeURIComponent(username.toLowerCase())}`, { headers: HEADERS })
  if (res.status === 404) throw new Error('Player not found on chess.com')
  if (!res.ok) throw new Error(`chess.com responded ${res.status}`)
}

const digest = (text: string) => {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0').slice(0, 4)
}

const colorOf = (white: string, black: string, you: string | null): Color | null =>
  !you ? null : white.toLowerCase() === you.toLowerCase() ? 'white' : black.toLowerCase() === you.toLowerCase() ? 'black' : null

export const toNewGame = (pgn: string, extra: Partial<Omit<NewGame, 'you'>> & { you: string | null }): NewGame | null => {
  const parsed = parseGame(pgn)
  if (!parsed || !parsed.moves.length) return null
  const h = parsed.headers
  const white = extra.white ?? h.get('White') ?? 'White'
  const black = extra.black ?? h.get('Black') ?? 'Black'
  const date = (h.get('UTCDate') ?? h.get('Date') ?? '').replace(/\./g, '-')
  const time = h.get('UTCTime') ?? h.get('EndTime') ?? '00:00:00'
  return {
    id: extra.id ?? `pgn-${digest(pgn)}`,
    url: extra.url ?? h.get('Link') ?? h.get('Site') ?? null,
    pgn,
    white,
    black,
    whiteRating: extra.whiteRating ?? (Number(h.get('WhiteElo')) || 0),
    blackRating: extra.blackRating ?? (Number(h.get('BlackElo')) || 0),
    result: h.get('Result') ?? '*',
    you: colorOf(white, black, extra.you),
    timeClass: extra.timeClass ?? 'other',
    timeControl: extra.timeControl ?? h.get('TimeControl') ?? '-',
    endTime: extra.endTime ?? (Date.parse(`${date}T${time}Z`) / 1000 || Math.floor(Date.now() / 1000)),
    opening: openingOf(parsed)?.name ?? null,
    moves: parsed.moves.length,
  }
}

const monthKey = (url: string) => url.split('/').slice(-2).join('/')

export const sync = async (username: string, onMonth?: (added: number) => void, live = () => true) => {
  const { archives } = await getJson<{ archives: string[] }>(`${API}/${encodeURIComponent(username.toLowerCase())}/games/archives`)
  const done = new Set(meta.get<string[]>(`archives:${username.toLowerCase()}`, []))
  const now = new Date()
  const current = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  let added = 0
  for (const url of archives.slice(-MONTHS).reverse()) {
    const key = monthKey(url)
    if (done.has(key)) continue
    const { games: list } = await getJson<{ games: ApiGame[] }>(url)
    if (!live()) break
    const rows = list
      .filter(g => g.rules === 'chess' && g.pgn)
      .map(g =>
        toNewGame(g.pgn!, {
          id: g.url.split('/').slice(-2).join('-'),
          url: g.url,
          white: g.white.username,
          black: g.black.username,
          whiteRating: g.white.rating,
          blackRating: g.black.rating,
          timeClass: g.time_class,
          timeControl: g.time_control,
          endTime: g.end_time,
          you: username,
        }),
      )
      .filter((g): g is NewGame => g !== null)
    const fresh = games.insert(rows)
    added += fresh
    onMonth?.(fresh)
    if (key < current) {
      done.add(key)
      meta.set(`archives:${username.toLowerCase()}`, [...done])
    }
  }
  return added
}
