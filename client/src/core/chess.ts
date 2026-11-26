import { Chess, type Position } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import { makeSquare, opposite, parseUci, roleToChar } from 'chessops/util'
import type { SquareSet } from 'chessops/squareSet'
import type { Color, NormalMove, Role, Square } from 'chessops/types'

export type { Color, NormalMove, Position, Role, Square }

export const VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 }
const SEE_VALUE: Record<Role, number> = { ...VALUE, king: 100 }
const ROLES: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
const PROMOTIONS: Role[] = ['queen', 'rook', 'bishop', 'knight']

export const position = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
export const fenOf = (pos: Position) => makeFen(pos.toSetup())
export const epd = (fen: string) => fen.split(' ', 4).join(' ')

export const isPromotionRank = (sq: Square) => sq < 8 || sq >= 56

export const moveOf = (uci: string) => parseUci(uci) as NormalMove

export const uciOf = (pos: Position, move: NormalMove) => {
  const castles = pos.board.getRole(move.from) === 'king' && pos.board[pos.turn].has(move.to)
  const to = castles ? move.from + (move.to > move.from ? 2 : -2) : move.to
  return makeSquare(move.from) + makeSquare(to) + (move.promotion ? roleToChar(move.promotion) : '')
}

export const legalMoves = (pos: Position) => {
  const moves: NormalMove[] = []
  for (const [from, dests] of pos.allDests()) {
    const pawn = pos.board.getRole(from) === 'pawn'
    for (const to of dests) {
      if (pawn && isPromotionRank(to)) for (const promotion of PROMOTIONS) moves.push({ from, to, promotion })
      else moves.push({ from, to })
    }
  }
  return moves
}

export const legalUcis = (pos: Position) => legalMoves(pos).map(m => uciOf(pos, m))

export const sanOf = (pos: Position, uci: string) => makeSan(pos, moveOf(uci))

export const sanLine = (fen: string, ucis: readonly string[], limit = ucis.length) => {
  const pos = position(fen)
  const out: string[] = []
  for (const uci of ucis.slice(0, limit)) {
    const move = moveOf(uci)
    if (!pos.isLegal(move)) break
    out.push(makeSan(pos, move))
    pos.play(move)
  }
  return out
}

export const walk = (fen: string, ucis: readonly string[]) => {
  const pos = position(fen)
  const frames: { pos: Position; uci: string; move: NormalMove; role: Role; captured: Role | undefined }[] = []
  for (const uci of ucis) {
    const move = moveOf(uci)
    if (!pos.isLegal(move)) break
    const role = pos.board.getRole(move.from)!
    const captured = enPassant(pos, move) ? 'pawn' : pos.board[opposite(pos.turn)].has(move.to) ? pos.board.getRole(move.to) : undefined
    frames.push({ pos: pos.clone(), uci, move, role, captured })
    pos.play(move)
  }
  return { frames, end: pos }
}

const enPassant = (pos: Position, move: NormalMove) =>
  pos.board.getRole(move.from) === 'pawn' && move.to === pos.epSquare && !pos.board.occupied.has(move.to)

export const material = (pos: Position, color: Color) =>
  ROLES.reduce((sum, role) => sum + VALUE[role] * pos.board.pieces(color, role).size(), 0)

export const balance = (pos: Position, color: Color) => material(pos, color) - material(pos, opposite(color))

export const nonPawnCount = (pos: Position) =>
  pos.board.occupied.diff(pos.board.pawn).diff(pos.board.king).size()

export const attackers = (pos: Position, sq: Square, by: Color, occupied = pos.board.occupied): SquareSet =>
  pos.kingAttackers(sq, by, occupied).intersect(occupied)

export const cheapest = (pos: Position, set: SquareSet): Square | undefined => {
  for (const role of ROLES) {
    const hit = set.intersect(pos.board[role]).first()
    if (hit !== undefined) return hit
  }
}

export const see = (pos: Position, from: Square, to: Square) => {
  const board = pos.board
  const victim = board.getRole(to)
  const gain = [victim ? SEE_VALUE[victim] : 0]
  let occupied = board.occupied
  let side = board.getColor(from)!
  let role = board.getRole(from)!
  let sq: Square | undefined = from
  let d = 0
  do {
    d++
    gain[d] = SEE_VALUE[role] - gain[d - 1]
    if (Math.max(-gain[d - 1], gain[d]) < 0) break
    occupied = occupied.without(sq)
    side = opposite(side)
    sq = cheapest(pos, attackers(pos, to, side, occupied))
    if (sq !== undefined) role = board.getRole(sq)!
  } while (sq !== undefined)
  while (--d) gain[d - 1] = -Math.max(-gain[d - 1], gain[d])
  return gain[0]
}

export const threatOn = (pos: Position, sq: Square) => {
  const color = pos.board.getColor(sq)
  if (!color) return 0
  const from = cheapest(pos, attackers(pos, sq, opposite(color)))
  return from === undefined ? 0 : see(pos, from, sq)
}

export const isHanging = (pos: Position, sq: Square) => threatOn(pos, sq) > 0

export const squareName = makeSquare

export { opposite }
