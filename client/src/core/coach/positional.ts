import { attacks, pawnAttacks } from 'chessops/attacks'
import { SquareSet } from 'chessops/squareSet'
import { parseUci } from 'chessops/util'
import { attackers, opposite, threatOn, type Color, type NormalMove, type Position, type Role } from '../chess.ts'

export type Trait = 'king' | 'development' | 'activity' | 'structure' | 'passed' | 'center' | 'kingActivity'

type Traits = Record<Trait, number>

const CENTER = SquareSet.fromSquare(27).with(28).with(35).with(36)
const HOME_MINORS: Record<Color, SquareSet> = {
  white: SquareSet.fromSquare(1).with(2).with(5).with(6),
  black: SquareSet.fromSquare(57).with(58).with(61).with(62),
}
const MOBILITY: Partial<Record<Role, number>> = { knight: 1, bishop: 1, rook: 0.6, queen: 0.3 }

const file = (sq: number) => sq & 7
const rank = (sq: number) => sq >> 3
const fileMask = (f: number) => (f < 0 || f > 7 ? SquareSet.empty() : SquareSet.fromFile(f))

const pawnSpan = (pos: Position, color: Color) => {
  let covered = SquareSet.empty()
  for (const sq of pos.board.pieces(color, 'pawn')) covered = covered.union(pawnAttacks(color, sq))
  return covered
}

const kingSafety = (pos: Position, me: Color) => {
  const king = pos.board.kingOf(me)
  if (king === undefined || pos.board.pieces(opposite(me), 'queen').isEmpty()) return 0
  const pawns = pos.board.pieces(me, 'pawn')
  const dir = me === 'white' ? 1 : -1
  let shield = 0
  let open = 0
  for (let f = file(king) - 1; f <= file(king) + 1; f++) {
    if (f < 0 || f > 7) continue
    const own = pawns.intersect(fileMask(f))
    if (own.isEmpty()) open++
    for (const r of [rank(king) + dir, rank(king) + 2 * dir]) if (r >= 0 && r < 8 && own.has(r * 8 + f)) shield++
  }
  let pressure = 0
  for (const sq of attacks({ role: 'king', color: me }, king, pos.board.occupied).with(king)) pressure += Math.min(2, attackers(pos, sq, opposite(me)).size())
  const central = (file(king) === 3 || file(king) === 4) && rank(king) === (me === 'white' ? 0 : 7) && !pos.castles.castlingRights.intersects(SquareSet.backrank(me)) ? 1 : 0
  return shield * 0.5 - open * 0.45 - pressure * 0.35 - central * 1.2
}

const development = (pos: Position, me: Color) => -pos.board[me].intersect(HOME_MINORS[me]).intersect(pos.board.knight.union(pos.board.bishop)).size()

const activity = (pos: Position, me: Color) => {
  const blocked = pos.board[me].union(pawnSpan(pos, opposite(me)))
  let score = 0
  for (const sq of pos.board[me]) {
    const piece = pos.board.get(sq)!
    const weight = MOBILITY[piece.role]
    if (weight) score += attacks(piece, sq, pos.board.occupied).diff(blocked).size() * weight
  }
  return score / 4
}

const structure = (pos: Position, me: Color) => {
  const pawns = pos.board.pieces(me, 'pawn')
  let weak = 0
  for (let f = 0; f < 8; f++) {
    const count = pawns.intersect(fileMask(f)).size()
    if (!count) continue
    if (count > 1) weak += count - 1
    if (pawns.intersect(fileMask(f - 1).union(fileMask(f + 1))).isEmpty()) weak += count
  }
  return -weak * 0.6
}

const passers = (pos: Position, me: Color) => {
  const theirs = pos.board.pieces(opposite(me), 'pawn')
  let score = 0
  for (const sq of pos.board.pieces(me, 'pawn')) {
    const ahead = me === 'white' ? SquareSet.full().shl64(sq + 1) : SquareSet.full().shr64(64 - sq)
    const lanes = fileMask(file(sq)).union(fileMask(file(sq) - 1)).union(fileMask(file(sq) + 1))
    if (theirs.intersect(ahead).intersect(lanes).isEmpty()) {
      const progress = me === 'white' ? rank(sq) : 7 - rank(sq)
      score += progress ** 1.6 / 6
    }
  }
  return score
}

const center = (pos: Position, me: Color) => {
  let control = pos.board.pieces(me, 'pawn').intersect(CENTER).size()
  for (const sq of CENTER) control += Math.min(2, attackers(pos, sq, me).size()) * 0.25
  return control
}

const kingActivity = (pos: Position, me: Color) => {
  const king = pos.board.kingOf(me)
  if (king === undefined) return 0
  return -Math.max(Math.abs(file(king) - 3.5), Math.abs(rank(king) - 3.5)) * 0.5
}

export const traits = (pos: Position, me: Color, phase: 0 | 1 | 2): Traits => ({
  king: phase < 2 ? kingSafety(pos, me) : 0,
  development: phase === 0 ? development(pos, me) : 0,
  activity: activity(pos, me),
  structure: structure(pos, me),
  passed: passers(pos, me) - passers(pos, opposite(me)),
  center: phase < 2 ? center(pos, me) - center(pos, opposite(me)) * 0.5 : 0,
  kingActivity: phase === 2 ? kingActivity(pos, me) : 0,
})

const WEIGHT: Traits = { king: 1.1, development: 0.9, activity: 0.7, structure: 0.8, passed: 1, center: 0.6, kingActivity: 1 }

export const compare = (afterBest: Position, afterPlayed: Position, me: Color, phase: 0 | 1 | 2) => {
  const best = traits(afterBest, me, phase)
  const played = traits(afterPlayed, me, phase)
  let pick: { trait: Trait; delta: number } | null = null
  for (const trait of Object.keys(best) as Trait[]) {
    const delta = (best[trait] - played[trait]) * WEIGHT[trait]
    if (delta > 0.45 && (!pick || delta > pick.delta)) pick = { trait, delta }
  }
  return pick
}

export type Threat = { kind: 'pressure'; role: Role; sq: number } | { kind: 'storm' | 'space' | 'entry' }

const WORTH: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 }

export const threatOf = (after: Position, reply: string, me: Color): Threat | null => {
  const move = parseUci(reply) as NormalMove
  const role = after.board.getRole(move.from)
  if (!role || !after.isLegal(move)) return null
  const them = opposite(me)
  const next = after.clone()
  next.play(move)
  for (const sq of next.board[me].diff(next.board.king).diff(next.board.pawn)) {
    const mine = next.board.getRole(sq)!
    if (!attacks(next.board.get(move.to)!, move.to, next.board.occupied).has(sq)) continue
    if (threatOn(next, sq) > 0 || WORTH[role] < WORTH[mine]) return { kind: 'pressure', role: mine, sq }
  }
  const king = next.board.kingOf(me)
  const ahead = (sq: number) => (them === 'white' ? rank(sq) >= 3 : rank(sq) <= 4)
  if (role === 'pawn' && king !== undefined && Math.abs(file(move.to) - file(king)) <= 1 && ahead(move.to)) return { kind: 'storm' }
  if (role === 'pawn' && file(move.to) >= 2 && file(move.to) <= 5 && ahead(move.to)) return { kind: 'space' }
  if ((role === 'rook' || role === 'queen') && (me === 'white' ? rank(move.to) <= 1 : rank(move.to) >= 6)) return { kind: 'entry' }
  return null
}
