import { attacks, between, kingAttacks } from 'chessops/attacks'
import { SquareSet } from 'chessops/squareSet'
import { VALUE, attackers, balance, opposite, see, threatOn, walk, type Color, type Position, type Role, type Square } from '../chess.ts'
import type { Motif } from '../../../../shared/themes.ts'

export interface Piece {
  role: Role
  sq: Square
}

export interface Finding {
  motif: Motif | null
  gain: number
  piece?: Piece
  targets: Piece[]
  mate?: number
}

type Frame = ReturnType<typeof walk>['frames'][number]

const worth = (role: Role) => (role === 'king' ? 100 : VALUE[role])
const SLIDERS: Role[] = ['bishop', 'rook', 'queen']

const pieceAt = (pos: Position, sq: Square): Piece => ({ role: pos.board.getRole(sq)!, sq })

const attackedBy = (pos: Position, sq: Square) => {
  const piece = pos.board.get(sq)
  return piece ? attacks(piece, sq, pos.board.occupied) : SquareSet.empty()
}

const defended = (pos: Position, sq: Square) => attackers(pos, sq, pos.board.getColor(sq)!).nonEmpty()

const laterCaptures = (frames: Frame[], by: Color) =>
  frames.slice(1, 7).filter(f => f.pos.turn === by && f.captured).map(f => ({ sq: f.move.to, role: f.captured! }))

const quietIndex = (frames: Frame[]) => {
  let q = Math.min(frames.length, 6)
  while (q < frames.length && q < 10 && frames[q - 1]?.captured) q++
  return q
}

const backRankMate = (end: Position) => {
  if (!end.isCheckmate()) return false
  const loser = end.turn
  const king = end.board.kingOf(loser)
  if (king === undefined) return false
  const rank = loser === 'white' ? 0 : 7
  if (king >> 3 !== rank) return false
  const checkers = attackers(end, king, opposite(loser))
  return checkers.size() === 1 && (end.board.rook.has(checkers.first()!) || end.board.queen.has(checkers.first()!)) && checkers.first()! >> 3 === rank
}

const forkTargets = (after: Position, sq: Square, by: Color) => {
  const role = after.board.getRole(sq)!
  const enemy = after.board[opposite(by)]
  return [...attackedBy(after, sq).intersect(enemy)]
    .map(t => pieceAt(after, t))
    .filter(t => t.role === 'king' || worth(t.role) > worth(role) || (!defended(after, t.sq) && VALUE[t.role] >= 3))
}

const discovered = (before: Position, after: Position, from: Square, by: Color): Finding | null => {
  const enemy = after.board[opposite(by)]
  for (const s of after.board[by].intersect(after.board.bishop.union(after.board.rook).union(after.board.queen))) {
    for (const t of attackedBy(after, s).intersect(enemy)) {
      const target = pieceAt(after, t)
      if (target.role !== 'king' && VALUE[target.role] < 3) continue
      if (between(s, t).has(from) && !attackedBy(before, s).has(t)) return { motif: 'discovered', gain: 0, piece: pieceAt(after, s), targets: [target] }
    }
  }
  return null
}

const skewer = (after: Position, sq: Square, by: Color, captures: Piece[]): Finding | null => {
  const role = after.board.getRole(sq)!
  if (!SLIDERS.includes(role)) return null
  const enemy = after.board[opposite(by)]
  for (const front of attackedBy(after, sq).intersect(enemy)) {
    const f = pieceAt(after, front)
    if (f.role !== 'king' && VALUE[f.role] < 5) continue
    const beyond = attacks({ role, color: by }, sq, after.board.occupied.without(front)).diff(attackedBy(after, sq))
    for (const back of beyond.intersect(enemy)) {
      const b = pieceAt(after, back)
      if (worth(b.role) < worth(f.role) && between(sq, back).has(front) && captures.some(c => c.sq === back))
        return { motif: 'skewer', gain: 0, piece: { role, sq }, targets: [f, b] }
    }
  }
  return null
}

const pin = (after: Position, by: Color, moved: Square, captures: Piece[]): Finding | null => {
  const enemy = after.board[opposite(by)]
  for (const s of after.board[by].intersect(after.board.bishop.union(after.board.rook).union(after.board.queen))) {
    const piece = after.board.get(s)!
    for (const x of attackedBy(after, s).intersect(enemy)) {
      const pinned = pieceAt(after, x)
      if (pinned.role === 'king') continue
      const behind = attacks(piece, s, after.board.occupied.without(x)).diff(attackedBy(after, s)).intersect(enemy)
      for (const v of behind) {
        const back = pieceAt(after, v)
        if (!between(s, v).has(x) || worth(back.role) <= worth(pinned.role)) continue
        if (s === moved || captures.some(c => c.sq === x)) return { motif: 'pin', gain: 0, piece: pieceAt(after, s), targets: [pinned, back] }
      }
    }
  }
  return null
}

const removesDefender = (before: Position, first: Frame, captures: Piece[]): Finding | null => {
  if (!first.captured) return null
  const defender = { role: first.captured, sq: first.move.to }
  const guarded = attacks({ role: first.captured, color: opposite(first.pos.turn) }, first.move.to, before.board.occupied)
  const hit = captures.find(c => guarded.has(c.sq) && VALUE[c.role] >= 3)
  return hit ? { motif: 'defender', gain: 0, targets: [defender, hit] } : null
}

const trapped = (after: Position, by: Color, captures: Piece[]): Finding | null => {
  for (const c of captures) {
    if (VALUE[c.role] < 3 || after.board.getColor(c.sq) !== opposite(by) || attackers(after, c.sq, by).isEmpty()) continue
    const role = after.board.getRole(c.sq)!
    const exits = [...after.dests(c.sq)].filter(to => {
      const occupied = after.board.occupied.without(c.sq)
      const hunters = attackers(after, to, by, occupied)
      if (hunters.isEmpty()) return true
      return [...hunters].every(h => worth(after.board.getRole(h)!) >= worth(role)) && attackers(after, to, opposite(by), occupied).nonEmpty()
    })
    if (!exits.length) return { motif: 'trapped', gain: 0, targets: [{ role, sq: c.sq }] }
  }
  return null
}

export const findTactic = (fen: string, line: readonly string[], mate?: number): Finding | null => {
  const { frames, end } = walk(fen, line.slice(0, 10))
  if (!frames.length) return null
  const first = frames[0]
  const by = first.pos.turn
  if (mate !== undefined && mate > 0) {
    return { motif: backRankMate(end) ? 'backRank' : 'mate', gain: 99, mate, targets: [] }
  }
  const q = quietIndex(frames)
  const settled = frames[q]?.pos ?? end
  const gain = balance(settled, by) - balance(first.pos, by)
  if (gain < 2) return null
  const before = first.pos
  const after = frames[1]?.pos ?? end
  const to = first.move.to
  const captures = laterCaptures(frames, by)
  const promoted = frames.slice(0, 6).some(f => f.pos.turn === by && f.move.promotion)

  if (first.captured && VALUE[first.captured] >= 2 && see(before, first.move.from, to) >= 2 && VALUE[first.captured] + 1 >= gain)
    return { motif: 'hanging', gain, targets: [{ role: first.captured, sq: to }] }

  const fork = forkTargets(after, to, by)
  if (fork.length >= 2 && captures.some(c => fork.some(t => t.sq === c.sq)))
    return { motif: 'fork', gain, piece: pieceAt(after, to), targets: fork.sort((a, b) => worth(b.role) - worth(a.role)).slice(0, 2) }

  const tactic =
    discovered(before, after, first.move.from, by) ??
    skewer(after, to, by, captures) ??
    pin(after, by, to, captures) ??
    removesDefender(before, first, captures) ??
    trapped(after, by, captures)
  if (tactic) return { ...tactic, gain }

  if (promoted) return { motif: 'promotion', gain, targets: [] }

  const loose = frames.find(f => f.pos.turn === by && f.captured && VALUE[f.captured] >= 3 && !defended(f.pos, f.move.to))
  if (loose) return { motif: 'hanging', gain, targets: [{ role: loose.captured!, sq: loose.move.to }] }

  const prize = captures.sort((a, b) => VALUE[b.role] - VALUE[a.role])[0]
  return { motif: null, gain, targets: prize ? [prize] : [] }
}

export const hangingAfter = (pos: Position, color: Color) =>
  [...pos.board[color].diff(pos.board.king).diff(pos.board.pawn)]
    .map(sq => ({ sq, threat: threatOn(pos, sq) }))
    .filter(h => h.threat >= 2)

export const kingZone = (pos: Position, color: Color) => {
  const king = pos.board.kingOf(color)
  return king === undefined ? SquareSet.empty() : kingAttacks(king).with(king)
}
