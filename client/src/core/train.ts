import { attempts, cards, games, meta } from './db.ts'
import { byTheme, known, type PuzzleRow } from './puzzles.ts'
import { moveOf, position } from './chess.ts'
import { grade, schedule } from '../../../shared/fsrs.ts'
import { toModel } from './scale.ts'
import type { Card, Color, Focus, Line, Result, Review, TrainSession } from '../../../shared/types.ts'

const FORGIVING = 0.03
const DRILLS = 10
const FALLBACK_THEMES = ['fork', 'hangingPiece', 'pin', 'mateIn2']

export const puzzleRating = () => {
  const stored = meta.get<number | null>('puzzleRating', null)
  if (stored !== null) return stored
  const latest = games.latestRating()
  return latest ? toModel(latest.rating) - 100 : 1500
}

const forcingLine = (fen: string, pv: readonly string[]) => {
  const pos = position(fen)
  const moves = [pv[0]]
  pos.play(moveOf(pv[0]))
  for (let k = 1; k + 1 < pv.length && moves.length < 5; k += 2) {
    pos.play(moveOf(pv[k]))
    const follow = moveOf(pv[k + 1])
    const capture = pos.board.occupied.has(follow.to)
    if (!pos.isLegal(follow)) break
    pos.play(follow)
    if (!capture && !follow.promotion && !pos.isCheck() && !pos.isCheckmate()) break
    moves.push(pv[k], pv[k + 1])
  }
  return moves
}

export const addMistakeCards = (gameId: string, review: Review, lines: Line[][], you: Color, opponent: string) => {
  const now = Date.now()
  review.plies.forEach((p, i) => {
    if (p.color !== you || !p.best || !['mistake', 'blunder', 'miss'].includes(p.label)) return
    const options = lines[i]
    const top = options[0]
    if (!top || (options[1] && top.ep - options[1].ep < 0.08 && p.loss < 0.25)) return
    const before = i === 0 ? review.start : review.plies[i - 1].fen
    cards.add({
      id: `${gameId}:${p.ply}`,
      kind: 'mistake',
      fen: i >= 2 ? review.plies[i - 2].fen : review.start,
      lead: i >= 1 ? review.plies[i - 1].uci : null,
      moves: forcingLine(before, top.pv),
      accept: options.filter(o => o.ep >= top.ep - FORGIVING).map(o => o.uci),
      themes: [p.motif ?? 'positional'],
      rating: null,
      game: { id: gameId, ply: p.ply, opponent, san: p.san },
      due: now,
    })
  })
}

const fromPuzzle = (row: PuzzleRow): Card => {
  const moves = row.moves.split(' ')
  return {
    id: `lp:${row.id}`,
    kind: 'puzzle',
    fen: row.fen,
    lead: moves[0],
    moves: moves.slice(1),
    accept: [moves[1]],
    themes: row.themes.split(' '),
    rating: row.rating,
    game: null,
    due: 0,
    reps: 0,
  }
}

export const buildSession = async (focus: Focus[], only?: string): Promise<TrainSession> => {
  const now = Date.now()
  const rating = puzzleRating()
  const due = only ? [] : cards.due(now, 12)
  const themes = only ? [only] : focus.length ? [...new Set(focus.map(f => f.theme))] : FALLBACK_THEMES
  const quota = Math.ceil(DRILLS / themes.length)
  const picked = new Set(due.map(c => c.id))
  const drills: Card[] = []
  for (const theme of themes) {
    let taken = 0
    for (let widen = 0; taken < quota && widen < 4; widen++) {
      const spread = 110 + widen * 90
      for (const row of await byTheme(theme, rating - spread, rating + spread, quota * 3)) {
        const card = fromPuzzle(row)
        if (taken >= quota || picked.has(card.id) || attempts.seen(card.id)) continue
        picked.add(card.id)
        drills.push(card)
        taken++
      }
    }
  }
  const stats = cards.stats(now)
  return {
    due,
    drills: drills.slice(0, DRILLS),
    focus,
    puzzleRating: rating,
    stats: { cards: stats.cards, due: stats.due ?? 0, learned: stats.learned ?? 0 },
  }
}

export const recordResult = (id: string, result: Result) => {
  const now = Date.now()
  const lichess = id.startsWith('lp:')
  attempts.add(id, lichess ? 'puzzle' : 'mistake', result.solved, result.ms)
  const memory = cards.memory(id)
  if (memory) cards.update(id, schedule(memory, grade(result.solved, result.hints, result.ms), now))
  let rating = puzzleRating()
  if (lichess && !memory) {
    const row = known(id.slice(3))
    if (row) {
      const expected = 1 / (1 + 10 ** ((row.rating - rating) / 400))
      rating = Math.round(rating + (result.hints ? 12 : 24) * ((result.solved && !result.hints ? 1 : 0) - expected))
      meta.set('puzzleRating', rating)
      if (!result.solved) {
        cards.add({ ...fromPuzzle(row), due: now })
        cards.update(id, schedule({ stability: 0, difficulty: 0, reps: 0, lapses: 0, last: null }, 1, now))
      }
    }
  }
  return { puzzleRating: rating }
}
