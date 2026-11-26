import { parseComment, parsePgn, startingPosition } from 'chessops/pgn'
import { makeSanAndPlay, parseSan } from 'chessops/san'
import { epd, fenOf, uciOf } from './chess.ts'
import { ASSETS } from './assets.ts'

export interface ParsedMove {
  san: string
  uci: string
  before: string
  fen: string
  clock: number | null
}

export interface ParsedGame {
  headers: Map<string, string>
  start: string
  moves: ParsedMove[]
  base: number | null
  increment: number
}

const book = new Map<string, [string, string]>()

export const loadBook = async () => {
  if (book.size) return
  const data = (await fetch(ASSETS.openings).then(r => r.json())) as Record<string, [string, string]>
  for (const [key, value] of Object.entries(data)) book.set(key, value)
}

export const inBook = (fen: string) => book.get(epd(fen))

export const timeControl = (tc: string | undefined) => {
  const match = tc?.match(/^(\d+)(?:\+(\d+))?$/)
  return match ? { base: +match[1], increment: +(match[2] ?? 0) } : { base: null, increment: 0 }
}

export const parseGame = (pgn: string): ParsedGame | null => {
  const game = parsePgn(pgn)[0]
  if (!game) return null
  const setup = startingPosition(game.headers)
  if (setup.isErr) return null
  const pos = setup.unwrap()
  const start = fenOf(pos)
  const moves: ParsedMove[] = []
  for (const node of game.moves.mainline()) {
    const move = parseSan(pos, node.san)
    if (!move || !('from' in move)) break
    const before = fenOf(pos)
    const uci = uciOf(pos, move)
    const san = makeSanAndPlay(pos, move)
    const clock = node.comments?.map(parseComment).find(c => c.clock !== undefined)?.clock ?? null
    moves.push({ san, uci, before, fen: fenOf(pos), clock })
  }
  return { headers: game.headers, start, moves, ...timeControl(game.headers.get('TimeControl')) }
}

export const openingOf = (game: ParsedGame) => {
  let found: { eco: string; name: string; until: number } | null = null
  game.moves.slice(0, 40).forEach((m, i) => {
    const hit = inBook(m.fen)
    if (hit) found = { eco: hit[0], name: hit[1], until: i + 1 }
  })
  return found as { eco: string; name: string; until: number } | null
}
