import { SquareSet } from 'chessops/squareSet'
import { parseUci } from 'chessops/util'
import { opposite, type Color, type NormalMove, type Position } from '../chess.ts'
import type { Habits, Ply } from '../../../../shared/types.ts'

const FILES = 'abcdefgh'
const file = (sq: number) => sq & 7
const rank = (sq: number) => sq >> 3
const fileSet = (f: number) => (f < 0 || f > 7 ? SquareSet.empty() : SquareSet.fromFile(f))
const HOME_MINORS: Record<Color, number[]> = { white: [1, 2, 5, 6], black: [57, 58, 61, 62] }

const kingSide = (pos: Position, color: Color) => {
  const king = pos.board.kingOf(color)
  if (king === undefined) return null
  return file(king) >= 5 ? 'king' : file(king) <= 2 ? 'queen' : 'center'
}

const pawnsOn = (pos: Position, color: Color, f: number) => pos.board.pieces(color, 'pawn').intersect(fileSet(f))

const isolatedQueenPawn = (pos: Position, color: Color) =>
  pawnsOn(pos, color, 3).nonEmpty() && pawnsOn(pos, color, 2).isEmpty() && pawnsOn(pos, color, 4).isEmpty()

const openCentralFile = (pos: Position) => {
  for (const f of [3, 4, 2, 5]) if (pawnsOn(pos, 'white', f).isEmpty() && pawnsOn(pos, 'black', f).isEmpty()) return f
  return null
}

const rooksOn = (pos: Position, color: Color, f: number) =>
  pos.board.pieces(color, 'rook').union(pos.board.pieces(color, 'queen')).intersect(fileSet(f)).nonEmpty()

const lockedCenter = (pos: Position, me: Color) => {
  const dir = me === 'white' ? 8 : -8
  let pointing: 'king' | 'queen' | null = null
  for (const f of [3, 4]) {
    for (const sq of pawnsOn(pos, me, f)) {
      if (!pos.board.pieces(opposite(me), 'pawn').has(sq + dir)) continue
      const advanced = me === 'white' ? rank(sq) >= 3 : rank(sq) <= 4
      if (advanced) pointing = f === 4 ? 'king' : 'queen'
    }
  }
  return pointing
}

const undeveloped = (pos: Position, color: Color) =>
  HOME_MINORS[color].filter(sq => pos.board.knight.union(pos.board.bishop).intersect(pos.board[color]).has(sq)).length

const bishops = (pos: Position, color: Color) => pos.board.pieces(color, 'bishop').size()

const advancedPasser = (pos: Position, me: Color) => {
  const theirs = pos.board.pieces(opposite(me), 'pawn')
  for (const sq of pos.board.pieces(me, 'pawn')) {
    const progress = me === 'white' ? rank(sq) : 7 - rank(sq)
    if (progress < 4) continue
    const ahead = me === 'white' ? SquareSet.full().shl64(sq + 1) : SquareSet.full().shr64(64 - sq)
    const lanes = fileSet(file(sq)).union(fileSet(file(sq) - 1)).union(fileSet(file(sq) + 1))
    if (theirs.intersect(ahead).intersect(lanes).isEmpty()) return sq
  }
  return null
}

export const planFor = (pos: Position, me: Color, endgame: boolean): string | null => {
  const them = opposite(me)
  const queens = pos.board.queen.nonEmpty()
  if (endgame) {
    const passer = advancedPasser(pos, me)
    if (passer !== null) return `Your passed ${FILES[file(passer)]}-pawn was the trump card. Push it with your king walking beside it.`
    const theirs = advancedPasser(pos, them)
    if (theirs !== null) return `Their passed ${FILES[file(theirs)]}-pawn was the danger. Block the square in front of it with your king or a knight first.`
    return 'In the endgame your king is a fighting piece. March it to the center early.'
  }
  const mine = kingSide(pos, me)
  const theirsSide = kingSide(pos, them)
  if (queens && mine && theirsSide && mine !== 'center' && theirsSide !== 'center' && mine !== theirsSide)
    return 'Kings on opposite wings makes it a race. Throw your pawns at their king and open lines before they open yours.'
  if (isolatedQueenPawn(pos, me))
    return 'Your isolated d-pawn gives you space and open lines. Keep pieces on the board and attack; every trade makes the pawn weaker.'
  if (isolatedQueenPawn(pos, them))
    return 'Their isolated d-pawn is a long-term target. Park a knight on the square in front of it and trade pieces.'
  const locked = lockedCenter(pos, me)
  if (locked) return `The center was locked, so the game is decided on the wings. Your pawn chain points to the ${locked}side: push your pawns there.`
  const open = openCentralFile(pos)
  if (open !== null && queens && !rooksOn(pos, me, open))
    return `The ${FILES[open]}-file was open. Rooks belong on open files; doubling there first gives you control of the board.`
  if (bishops(pos, me) === 2 && bishops(pos, them) < 2) return 'You had the bishop pair. Open the position with pawn breaks and the bishops get stronger every move.'
  const lag = undeveloped(pos, them) - undeveloped(pos, me)
  if (lag >= 2) return 'You were ahead in development. Open the center quickly before their pieces catch up.'
  if (lag <= -2) return 'You fell behind in development. Finish developing and castle before starting any action.'
  return null
}

const emptyHabits = (): Habits => ({
  castled: null,
  earlyQueen: 0,
  repeats: 0,
  undeveloped: null,
  shieldPushes: 0,
  critical: [0, 0],
  routine: [0, 0],
  openingShare: null,
  winning: [0, 0],
  level: [0, 0],
  allowed: 0,
  missed: 0,
})

export const habitsOf = (plies: Ply[], positions: Position[], base: number | null): Record<Color, Habits> => {
  const out = { white: emptyHabits(), black: emptyHabits() }
  const moved: Record<Color, Set<number>> = { white: new Set(), black: new Set() }
  plies.forEach((p, i) => {
    const h = out[p.color]
    const pos = positions[i]
    const move = parseUci(p.uci) as NormalMove
    const role = pos.board.getRole(move.from)
    const capture = pos.board.occupied.has(move.to)
    const before = i === 0 ? 0.5 : plies[i - 1].white
    const mineEp = p.color === 'white' ? before : 1 - before
    const error = p.loss >= 0.1

    if (role === 'king' && Math.abs(move.to - move.from) === 2) h.castled = Math.ceil(p.ply / 2)
    if (role === 'queen' && p.ply <= 16) h.earlyQueen++
    if (p.ply <= 20 && role && role !== 'pawn' && role !== 'king') {
      if (moved[p.color].has(move.from) && !capture) h.repeats++
      moved[p.color].delete(move.from)
      moved[p.color].add(move.to)
    }
    if (role === 'pawn' && h.castled !== null && pos.board.pieces(opposite(p.color), 'queen').nonEmpty()) {
      const king = pos.board.kingOf(p.color)
      if (king !== undefined && Math.abs(file(move.from) - file(king)) <= 1 && Math.abs(rank(move.from) - rank(king)) <= 2) h.shieldPushes++
    }
    if (p.label !== 'book' && p.label !== 'forced') {
      if (mineEp >= 0.7) {
        h.winning[1]++
        if (error) h.winning[0]++
      } else if (mineEp >= 0.35 && mineEp <= 0.65) {
        h.level[1]++
        if (error) h.level[0]++
      }
      if (base && p.spent !== null) {
        const bucket = p.chance ? h.critical : h.routine
        bucket[0] += p.spent
        bucket[1]++
      }
    }
    if (error && p.cause === 'allowed') h.allowed++
    if (error && p.cause === 'missed') h.missed++
    if (base && p.ply === 19 + (p.color === 'white' ? 0 : 1) && p.clock !== null) h.openingShare = Math.round(((base - p.clock) / base) * 100) / 100
  })
  for (const color of ['white', 'black'] as const) {
    const at = positions[Math.min(24, positions.length - 1)]
    if (positions.length > 24) out[color].undeveloped = undeveloped(at, color)
  }
  return out
}
