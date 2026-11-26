import { parseUci } from 'chessops/util'
import { SquareSet } from 'chessops/squareSet'
import { VALUE, legalMoves, nonPawnCount, position, sanLine, sanOf, threatOn, type Color, type NormalMove, type Position } from '../chess.ts'
import { inBook, openingOf, type ParsedGame } from '../pgn.ts'
import { findTactic, type Finding } from './tactics.ts'
import { compare, threatOf, type Trait } from './positional.ts'
import * as words from './words.ts'
import { gameNotes, tipFor } from './notes.ts'
import { habitsOf, planFor } from './structure.ts'
import { gameAccuracy } from '../../../../shared/rating.ts'
import { fromModel, toModel } from '../scale.ts'
import { MOTIFS, type Motif } from '../../../../shared/themes.ts'
import type { HumanView } from '../maia.ts'
import type { Chance, Label, Line, Moment, Ply, Review, Side } from '../../../../shared/types.ts'

export const REVIEW_VERSION = 7
export const GRID = [900, 1300, 1700, 2100, 2500]

export interface ReviewInput {
  parsed: ParsedGame
  lines: Line[][]
  human: (HumanView | null)[]
  sweep: Record<Color, number[]> | null
  sweepCount: Record<Color, number>
  ratings: Record<Color, number>
  you: Color | null
  result: string
}

const ERRORS: Label[] = ['inaccuracy', 'mistake', 'miss', 'blunder']
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d

const terminalEp = (pos: Position) => (pos.isCheckmate() ? 0 : pos.isEnd() ? 0.5 : null)

const traitMotif = (trait: Trait, phase: 0 | 1 | 2): Motif => {
  switch (trait) {
    case 'king': return 'kingSafety'
    case 'development': return 'development'
    case 'center': return phase === 0 ? 'development' : 'activity'
    case 'activity': return 'activity'
    case 'structure': return 'structure'
    case 'passed': return phase === 2 ? 'endgame' : 'structure'
    case 'kingActivity': return 'endgame'
  }
}

const phaseOf = (pos: Position, ply: number, previous: 0 | 1 | 2): 0 | 1 | 2 => {
  const pieces = nonPawnCount(pos)
  if (pieces <= 6) return 2
  if (previous >= 1) return previous
  const sparse = (['white', 'black'] as const).some(c => pos.board[c].diff(pos.board.pawn).intersect(SquareSet.backrank(c)).size() < 4)
  return pieces <= 10 || sparse || ply > 30 ? 1 : 0
}


const sacrifice = (before: Position, move: NormalMove, after: Position) => {
  const victim = before.board.getRole(move.to)
  const won = victim && before.board.getColor(move.to) !== before.turn ? VALUE[victim] : 0
  let worst = 0
  let role = before.board.getRole(move.from)!
  for (const sq of after.board[before.turn].diff(after.board.king)) {
    const threat = threatOn(after, sq)
    if (threat > worst) {
      worst = threat
      role = after.board.getRole(sq)!
    }
  }
  return worst >= 2 && won - worst <= -2 ? role : null
}

const ACCURACY_ELO: [number, number][] = [[40, 250], [55, 550], [65, 850], [73, 1200], [80, 1550], [85, 1850], [89, 2150], [92, 2450], [95, 2750]]

const accuracyElo = (acc: number) => {
  const i = ACCURACY_ELO.findIndex(([a]) => a >= acc)
  if (i <= 0) return ACCURACY_ELO[i < 0 ? ACCURACY_ELO.length - 1 : 0][1]
  const [a0, e0] = ACCURACY_ELO[i - 1]
  const [a1, e1] = ACCURACY_ELO[i]
  return e0 + ((acc - a0) / (a1 - a0)) * (e1 - e0)
}

const perfFrom = (loglik: number[] | undefined, rating: number, count: number, accuracy: number) => {
  if (!loglik || count < 8) return null
  const prior = toModel(rating || 1500)
  const post = GRID.map((e, k) => loglik[k] - (e - prior) ** 2 / (2 * 520 ** 2))
  const top = Math.max(...post)
  const w = post.map(x => Math.exp(x - top))
  const human = fromModel(GRID.reduce((a, e, k) => a + e * w[k], 0) / w.reduce((a, b) => a + b, 0))
  return Math.round((human * 0.55 + accuracyElo(accuracy) * 0.45) / 10) * 10
}

const PHRASE: Record<Motif, string> = {
  mate: 'a mating attack',
  backRank: 'a back-rank mate',
  hanging: 'a free piece',
  fork: 'a fork',
  pin: 'a pin',
  skewer: 'a skewer',
  discovered: 'a discovered attack',
  defender: 'a removal of the defender',
  trapped: 'a trapped piece',
  promotion: 'a promotion',
  intermezzo: 'an in-between move',
  kingSafety: 'an attack on your king',
  structure: 'weak pawns',
  activity: 'your opponent the initiative',
  development: 'a lead in development',
  endgame: 'a better endgame',
}

const moveNumber = (p: Ply) => `${Math.ceil(p.ply / 2)}${p.color === 'white' ? '.' : '...'} ${p.san}`

const scoreFor = (result: string, color: Color) => (result === '1/2-1/2' ? 0.5 : result === (color === 'white' ? '1-0' : '0-1') ? 1 : 0)

export const buildReview = (input: ReviewInput): Review => {
  const { parsed, lines, human, you } = input
  const fens = [parsed.start, ...parsed.moves.map(m => m.fen)]
  const positions = fens.map(position)
  const stmEp = (i: number) => terminalEp(positions[i]) ?? lines[i][0]?.ep ?? 0.5
  const whiteAt = (i: number) => (positions[i].turn === 'white' ? stmEp(i) : 1 - stmEp(i))
  const opening = openingOf(parsed)
  const lastClock: Record<Color, number | null> = { white: parsed.base, black: parsed.base }
  const plies: Ply[] = []
  let phase: 0 | 1 | 2 = 0
  let booked = true

  parsed.moves.forEach((m, i) => {
    const pos = positions[i]
    const after = positions[i + 1]
    const mover = pos.turn
    const l = lines[i]
    const best = l[0]
    const reply = lines[i + 1]?.[0]
    const epBest = best?.ep ?? stmEp(i)
    const epAfter = 1 - stmEp(i + 1)
    const playedBest = !best || best.uci === m.uci
    const loss = playedBest ? 0 : Math.max(0, epBest - epAfter)
    const legal = legalMoves(pos).length
    const gap = l.length > 1 ? best.ep - l[1].ep : legal === 1 ? 1 : 0
    const view = human[i]
    const pPlayed = view?.policy.get(m.uci) ?? null
    const pBest = best && view ? view.policy.get(best.uci) ?? null : null
    phase = phaseOf(pos, i + 1, phase)
    booked = booked && i < 30 && !!inBook(m.fen)
    const prev = plies[i - 1]
    const recapture = !!prev && prev.uci.slice(2, 4) === m.uci.slice(2, 4)

    let label: Label =
      legal === 1 ? 'forced'
      : booked ? 'book'
      : playedBest || loss <= 0.002 ? 'best'
      : loss <= 0.02 ? 'excellent'
      : loss <= 0.05 ? 'good'
      : loss <= 0.1 ? 'inaccuracy'
      : loss <= 0.2 ? 'mistake'
      : 'blunder'

    let note: string | null = label === 'book' ? inBook(m.fen)?.[1] ?? null : null
    const move = parseUci(m.uci) as NormalMove
    if ((label === 'best' || label === 'excellent') && loss <= 0.01) {
      const sac = sacrifice(pos, move, after)
      if (sac && epAfter >= 0.45 && epBest < 0.98 && (pPlayed === null || pPlayed < 0.15)) {
        label = 'brilliant'
        note = words.brilliant(sac)
      } else if (gap >= 0.15 && epBest >= 0.2 && !recapture && !pos.isCheck() && (pPlayed === null || pPlayed < 0.4)) {
        label = 'great'
        note = words.great(epAfter)
      }
    }
    if (ERRORS.includes(label) && prev && prev.color !== mover && prev.loss >= 0.12 && loss >= 0.1) {
      const before = 1 - (lines[i - 1][0]?.ep ?? 0.5)
      if (epAfter >= before - 0.05) label = 'miss'
    }

    const bestSan = best && !playedBest ? sanOf(pos, best.uci) : null
    let motif: Motif | null = null
    let cause: Ply['cause'] = null
    let missedF: Finding | null = null
    if (ERRORS.includes(label) && best) {
      const replySan = reply ? sanOf(after, reply.uci) : ''
      const allowedF = reply && loss >= 0.08 ? findTactic(fens[i + 1], reply.pv, reply.mate) : null
      missedF = findTactic(fens[i], best.pv, best.mate)
      const missedMate = missedF?.motif === 'mate' || missedF?.motif === 'backRank'
      if (label === 'miss' && missedF) {
        note = words.missed(missedF, bestSan!)
        motif = missedF.motif
        cause = 'missed'
      } else if (allowedF && !missedMate) {
        note = words.allowed(allowedF, replySan, move.to)
        motif = allowedF.motif
        cause = 'allowed'
      } else if (missedF) {
        note = words.missed(missedF, bestSan!)
        motif = missedF.motif
        cause = 'missed'
      } else {
        const afterBest = pos.clone()
        afterBest.play(parseUci(best.uci) as NormalMove)
        const pick = compare(afterBest, after, mover, phase)
        const bestMove = parseUci(best.uci) as NormalMove
        const bestRole = pos.board.getRole(bestMove.from)!
        const castles = bestRole === 'king' && Math.abs(bestMove.to - bestMove.from) === 2
        const danger = reply ? threatOf(after, reply.uci, mover) : null
        if (pick) {
          note = words.positional(pick.trait, m.san, bestSan!, bestRole, bestRole === 'king', castles)
          motif = traitMotif(pick.trait, phase)
          cause = 'positional'
        } else if (danger && replySan) {
          note = words.threat(danger, replySan)
          motif = danger.kind === 'storm' ? 'kingSafety' : danger.kind === 'space' ? (phase === 0 ? 'development' : 'activity') : 'activity'
          cause = 'positional'
        } else note = label === 'inaccuracy' ? `Slightly better was ${bestSan}.` : words.subtle(bestSan!, replySan || null)
      }
      if (label === 'inaccuracy' && cause !== 'positional' && note && !note.includes(bestSan!)) note = `${note} ${bestSan} was better.`
    }

    let chance: Chance | null = null
    if (best && label !== 'book' && label !== 'forced' && gap >= 0.1) {
      const f = missedF ?? findTactic(fens[i], best.pv, best.mate)
      if (f?.motif || gap >= 0.2) chance = { motif: f?.motif ?? null, found: loss <= 0.02, ease: round(pBest ?? 0.5, 2) }
    }

    const clock = parsed.base === null ? null : m.clock
    const prevClock = lastClock[mover]
    const spent = clock !== null && prevClock !== null ? Math.max(0, round(prevClock - clock + parsed.increment, 1)) : null
    lastClock[mover] = clock

    const top = lines[i + 1]?.[0]
    const sign = after.turn === 'white' ? 1 : -1
    plies.push({
      ply: i + 1,
      color: mover,
      san: m.san,
      uci: m.uci,
      fen: m.fen,
      white: round(whiteAt(i + 1)),
      cp: after.isCheckmate() ? null : top?.cp !== undefined ? top.cp * sign : after.isEnd() ? 0 : null,
      mate: after.isCheckmate() ? 0 : top?.mate !== undefined ? top.mate * sign : null,
      loss: round(loss),
      label,
      best: bestSan && best ? { san: bestSan, uci: best.uci, line: sanLine(fens[i], best.pv, 8) } : null,
      reply: ERRORS.includes(label) && reply ? { uci: reply.uci, line: sanLine(fens[i + 1], reply.pv, 6) } : null,
      human: pPlayed === null ? null : round(pPlayed, 3),
      clock,
      spent,
      motif,
      cause,
      note,
      tip: null,
      chance,
      phase,
    })
    const added = plies[plies.length - 1]
    if (ERRORS.includes(label) && (you === null || mover === you) && !(label === 'inaccuracy' && cause === 'positional')) added.tip = tipFor(added, parsed.base)
  })

  const curve = [whiteAt(0), ...plies.map(p => p.white)]
  const losses = plies.map(p => p.loss)
  const startWhite = positions[0].turn === 'white' ? 0 : 1
  const side = (color: Color): Side => {
    const counts: Side['counts'] = {}
    for (const p of plies) if (p.color === color) counts[p.label] = (counts[p.label] ?? 0) + 1
    const accuracy = gameAccuracy(curve, losses, ((color === 'white' ? 0 : 1) ^ startWhite) as 0 | 1)
    return { accuracy, perf: perfFrom(input.sweep?.[color], input.ratings[color], input.sweepCount[color], accuracy), counts }
  }
  const sides = { white: side('white'), black: side('black') }
  const me = you ?? 'white'
  const middle = plies.findIndex(p => p.phase >= 1)
  const late = plies.findIndex(p => p.phase === 2)
  const plan =
    (middle >= 0 ? planFor(positions[middle + 1], me, false) : null) ??
    (late >= 0 && late < plies.length - 6 ? planFor(positions[late + 1], me, true) : null)

  return {
    version: REVIEW_VERSION,
    start: parsed.start,
    origin: round(curve[0]),
    plies,
    white: sides.white,
    black: sides.black,
    moments: moments(plies, you),
    takeaways: takeaways(plies, me, input.result, sides[me].accuracy, parsed.base, opening?.name ?? null),
    notes: gameNotes(plies, me, input.result, parsed.base, plan),
    habits: habitsOf(plies, positions, parsed.base),
    opening,
  }
}

const moments = (plies: Ply[], you: Color | null): Moment[] => {
  const scored = plies.flatMap((p): (Moment & { score: number })[] => {
    const mine = you === null || p.color === you
    if (mine && (p.label === 'brilliant' || p.label === 'great')) return [{ ply: p.ply, tone: 'good', score: 0.16 + p.loss }]
    if (mine && p.loss >= 0.08 && ERRORS.includes(p.label)) return [{ ply: p.ply, tone: 'bad', score: p.loss }]
    if (!mine && p.loss >= 0.15) return [{ ply: p.ply, tone: 'turn', score: p.loss * 0.6 }]
    return []
  })
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .sort((a, b) => a.ply - b.ply)
    .map(({ ply, tone }) => ({ ply, tone }))
}

const takeaways = (plies: Ply[], you: Color, result: string, accuracy: number, base: number | null, opening: string | null) => {
  const mine = plies.filter(p => p.color === you)
  const theirs = plies.filter(p => p.color !== you)
  const score = scoreFor(result, you)
  const out: { score: number; text: string }[] = []
  const yourEp = (p: Ply) => (you === 'white' ? p.white : 1 - p.white)
  const worst = mine.reduce<Ply | null>((a, p) => (!a || p.loss > a.loss ? p : a), null)

  if (plies.length < 12) return []
  if (worst && worst.loss >= 0.15) {
    const phrase = worst.motif ? PHRASE[worst.motif] : null
    const what = phrase ? `: ${worst.cause === 'missed' ? 'you missed' : 'it allowed'} ${phrase}` : ''
    out.push({ score: worst.loss * 2, text: `${moveNumber(worst)} was the turning point${what}.` })
  }

  const firstError = mine.find(p => p.loss >= 0.1 && ERRORS.includes(p.label))
  if (firstError && firstError.ply <= 24) out.push({ score: 0.55, text: `Your opening went wrong at move ${Math.ceil(firstError.ply / 2)}${opening ? `. Revisit the ${opening.split(':')[0]}` : ''}.` })
  else if (plies.length >= 30 && (!firstError || firstError.ply > 30)) out.push({ score: 0.2, text: `Clean opening. No real errors through move ${Math.ceil(Math.min(firstError?.ply ?? plies.length, 30) / 2)}.` })

  if (base) {
    const pressure = mine.filter(p => p.clock !== null && p.clock + (p.spent ?? 0) < Math.max(30, base * 0.1) && p.loss >= 0.1)
    if (pressure.length >= 2) out.push({ score: 0.5, text: `${pressure.length} of your errors came in time trouble.` })
    const rushed = mine.find(p => p.chance && p.spent !== null && p.spent < 3 && p.loss >= 0.1)
    if (rushed) out.push({ score: 0.42, text: `Move ${Math.ceil(rushed.ply / 2)} was critical and you spent ${Math.round(rushed.spent ?? 0)}s on it.` })
  }

  const winning = mine.find(p => yourEp(p) >= 0.85 && p.ply > 16)
  if (winning && score < 1) out.push({ score: 0.7, text: `You were winning by move ${Math.ceil(winning.ply / 2)} and let it slip.` })
  const lost = plies.find(p => yourEp(p) <= 0.15 && p.ply > 16)
  if (lost && score >= 0.5) out.push({ score: 0.38, text: 'You saved a lost position. Good fight.' })

  const missedTactics = mine.filter(p => p.chance?.motif && !p.chance.found && p.chance.motif !== 'mate')
  if (missedTactics.length >= 2) {
    const names = [...new Set(missedTactics.map(p => MOTIFS[p.chance!.motif!].name.toLowerCase()))].slice(0, 2).join(', ')
    out.push({ score: 0.45, text: `You missed ${missedTactics.length} tactics (${names}).` })
  }
  const missedMates = mine.filter(p => p.chance?.motif === 'mate' && !p.chance.found)
  if (missedMates.length) out.push({ score: 0.6, text: missedMates.length === 1 ? 'You missed a forced mate.' : `You missed ${missedMates.length} forced mates.` })

  const punished = theirs.filter(p => p.loss >= 0.15).length
  if (punished >= 2 && score === 1) out.push({ score: 0.3, text: 'Your opponent gave chances and you took them.' })
  if (accuracy >= 90) out.push({ score: 0.35, text: `${accuracy}% accuracy. A very clean game.` })

  return out.sort((a, b) => b.score - a.score).slice(0, 3).map(t => t.text)
}
