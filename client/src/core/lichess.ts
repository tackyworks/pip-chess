import { games, meta, type NewGame } from './db.ts'
import { toNewGame } from './chesscom.ts'

const FIRST = 300

const classOf = (event: string, tc: string) => {
  const named = /bullet|blitz|rapid|classical|correspondence/i.exec(event)?.[0].toLowerCase()
  if (named) return named === 'correspondence' ? 'daily' : named
  const [base, inc] = tc.split('+').map(Number)
  if (!base) return 'daily'
  const total = base + 40 * (inc || 0)
  return total < 180 ? 'bullet' : total < 480 ? 'blitz' : total < 1500 ? 'rapid' : 'classical'
}

const header = (pgn: string, key: string) => new RegExp(String.raw`\[${key} "([^"]*)"\]`).exec(pgn)?.[1] ?? ''

export const exists = async (username: string) => {
  const res = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`)
  if (res.status === 404) throw new Error('Player not found on Lichess')
  if (!res.ok) throw new Error(`Lichess responded ${res.status}`)
}

export const sync = async (username: string, onBatch?: (added: number) => void, live = () => true) => {
  const key = `lichess:since:${username.toLowerCase()}`
  const since = meta.get<number>(key, 0)
  const params = new URLSearchParams({ clocks: 'true', opening: 'true', sort: 'dateDesc' })
  if (since) params.set('since', String(since + 1))
  else params.set('max', String(FIRST))
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`, { headers: { accept: 'application/x-chess-pgn' } })
  if (res.status === 404) throw new Error('Player not found on Lichess')
  if (!res.ok || !res.body) throw new Error(`Lichess responded ${res.status}`)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let added = 0
  let latest = since
  const flush = (chunks: string[]) => {
    const rows = chunks
      .filter(pgn => (header(pgn, 'Variant') || 'Standard') === 'Standard')
      .map(pgn => {
        const link = header(pgn, 'Site')
        const end = Date.parse(`${header(pgn, 'UTCDate').replace(/\./g, '-')}T${header(pgn, 'UTCTime') || '00:00:00'}Z`) || Date.now()
        latest = Math.max(latest, end)
        return toNewGame(pgn, {
          id: `lichess-${link.split('/').pop()}`,
          url: link,
          timeClass: classOf(header(pgn, 'Event'), header(pgn, 'TimeControl')),
          endTime: Math.floor(end / 1000),
          you: username,
        })
      })
      .filter((g): g is NewGame => g !== null)
    const fresh = games.insert(rows)
    added += fresh
    if (fresh) onBatch?.(fresh)
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (!live()) {
      await reader.cancel()
      return added
    }
    if (value) buffer += value
    const parts = buffer.split(/\n\n\n+(?=\[)/)
    buffer = done ? '' : parts.pop() ?? ''
    const complete = done ? parts.concat(buffer ? [buffer] : []) : parts
    if (complete.length >= 20 || done) flush(complete.filter(p => p.trim()))
    else buffer = [...complete, buffer].join('\n\n\n')
    if (done) break
  }
  if (latest > since) meta.set(key, latest)
  return added
}
