import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import { chessgroundDests } from 'chessops/compat'
import { makeSquare, parseSquare, parseUci } from 'chessops/util'
import type { NormalMove } from 'chessops/types'
import type { Key } from 'chessground/types'

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const load = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap()

export const turnOf = (fen: string) => (fen.split(' ')[1] === 'b' ? 'black' : 'white') as 'white' | 'black'

export const destsOf = (fen: string) => chessgroundDests(load(fen)) as Map<Key, Key[]>

export const inCheck = (fen: string) => load(fen).isCheck()

export const squares = (uci: string): [Key, Key] => [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key]

export const standardUci = (fen: string, orig: string, dest: string, promotion = 'q') => {
  const pos = load(fen)
  const from = parseSquare(orig)!
  let to = parseSquare(dest)!
  const role = pos.board.getRole(from)
  if (role === 'king' && pos.board[pos.turn].has(to)) to = from + (to > from ? 2 : -2)
  const promote = role === 'pawn' && (to < 8 || to >= 56)
  return makeSquare(from) + makeSquare(to) + (promote ? promotion : '')
}

export const play = (fen: string, uci: string) => {
  const pos = load(fen)
  const move = parseUci(uci) as NormalMove
  if (!pos.isLegal(move)) return null
  const capture = pos.board.occupied.has(move.to) && pos.board.getColor(move.to) !== pos.turn
  const san = makeSan(pos, move)
  pos.play(move)
  return { fen: makeFen(pos.toSetup()), san, capture, check: pos.isCheck(), mate: pos.isCheckmate(), end: pos.isEnd() }
}

export const playLine = (fen: string, ucis: string[]) => {
  let current = fen
  for (const uci of ucis) current = play(current, uci)?.fen ?? current
  return current
}

