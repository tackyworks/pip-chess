import { games } from '../db.ts'
import { timeControl } from '../pgn.ts'
import { mean, moveAccuracy } from '../../../../shared/rating.ts'
import { MOTIFS, type Motif } from '../../../../shared/themes.ts'
import type { Color, Focus, GameRow, HabitStat, Habits, Insights, MotifStat, OpeningStat, Review } from '../../../../shared/types.ts'

const ERRORS = new Set(['inaccuracy', 'mistake', 'miss', 'blunder'])
const POSITIONAL: Motif[] = ['kingSafety', 'structure', 'activity', 'development', 'endgame']

const scoreOf = (game: GameRow) => {
  if (game.result === '1/2-1/2') return 0.5
  return game.result === (game.you === 'white' ? '1-0' : '0-1') ? 1 : 0
}

let cache: { key: string; value: Insights } | null = null

export const invalidateInsights = () => {
  cache = null
}

export const insights = (timeClass?: string): Insights => {
  const reviewed = games.reviewed()
  const all = timeClass ? reviewed.filter(r => r.game.timeClass === timeClass) : reviewed
  const counts = games.counts()
  const key = `${timeClass ?? '*'}:${all.length}:${counts.games}`
  if (cache?.key === key) return cache.value
  const value = { ...compute(all, counts.games), classes: [...new Set(reviewed.map(r => r.game.timeClass))] }
  cache = { key, value }
  return value
}

const compute = (all: { game: GameRow; review: Review }[], total: number): Omit<Insights, 'classes'> => {
  const rows = all.map(({ game, review }) => {
    const you = game.you as Color
    const mine = review.plies.filter(p => p.color === you)
    return { game, review, you, mine, score: scoreOf(game), base: timeControl(game.timeControl).base }
  })

  const phases = [0, 1, 2].map(phase => {
    const moves = rows.flatMap(r => r.mine.filter(p => p.phase === phase && p.label !== 'book' && p.label !== 'forced'))
    return { accuracy: Math.round(mean(moves.map(p => moveAccuracy(p.loss)))), moves: moves.length }
  })

  const motifs = new Map<Motif, MotifStat>()
  const stat = (motif: Motif) => {
    let s = motifs.get(motif)
    if (!s) motifs.set(motif, (s = { motif, chances: 0, missed: 0, allowed: 0, expected: 0, ratio: 1 }))
    return s
  }
  for (const r of rows) {
    for (const p of r.mine) {
      if (p.chance?.motif) {
        const s = stat(p.chance.motif)
        s.chances++
        s.expected += 1 - p.chance.ease
        if (!p.chance.found) s.missed++
      }
      if (p.motif && p.cause === 'allowed' && p.loss >= 0.08) stat(p.motif).allowed++
      if (p.motif && p.cause === 'positional' && p.loss >= 0.1) stat(p.motif).allowed++
    }
  }
  const motifList = [...motifs.values()]
    .map(s => ({ ...s, expected: Math.round(s.expected * 10) / 10, ratio: Math.round(((s.missed + 1) / (s.expected + 1)) * 100) / 100 }))
    .filter(s => s.chances + s.allowed >= 2)
    .sort((a, b) => weakness(b, rows.length) - weakness(a, rows.length))

  const conversion = { chances: 0, converted: 0 }
  const resilience = { chances: 0, saved: 0 }
  for (const r of rows) {
    const curve = r.review.plies.filter(p => p.ply > 16).map(p => (r.you === 'white' ? p.white : 1 - p.white))
    if (curve.some(x => x >= 0.85)) {
      conversion.chances++
      if (r.score === 1) conversion.converted++
    }
    if (curve.some(x => x <= 0.15)) {
      resilience.chances++
      if (r.score >= 0.5) resilience.saved++
    }
  }

  const time = { pressureMoves: 0, pressureErrors: 0, calmMoves: 0, calmErrors: 0, rushed: 0 }
  for (const r of rows) {
    if (!r.base) continue
    for (const p of r.mine) {
      if (p.clock === null || p.label === 'book') continue
      const left = p.clock + (p.spent ?? 0)
      const error = p.loss >= 0.1
      if (left < Math.max(30, r.base * 0.1)) {
        time.pressureMoves++
        if (error) time.pressureErrors++
      } else {
        time.calmMoves++
        if (error) time.calmErrors++
      }
      if (error && p.chance && p.spent !== null && p.spent < 3) time.rushed++
    }
  }

  const tilt = { after: { loss: [] as number[], win: [] as number[] } }
  const live = rows.filter(r => r.game.timeClass !== 'daily')
  live.forEach((r, i) => {
    const prev = live[i - 1]
    if (!prev || r.game.endTime - prev.game.endTime > 7200) return
    if (prev.score === 0) tilt.after.loss.push(r.score)
    if (prev.score === 1) tilt.after.win.push(r.score)
  })

  const openingMap = new Map<string, { name: string; color: Color; scores: number[]; acc: number[]; errors: number[] }>()
  for (const r of rows) {
    const name = (r.review.opening?.name ?? r.game.opening ?? 'Unknown').split(':')[0]
    const k = `${r.you}|${name}`
    let o = openingMap.get(k)
    if (!o) openingMap.set(k, (o = { name, color: r.you, scores: [], acc: [], errors: [] }))
    o.scores.push(r.score)
    o.acc.push(mean(r.mine.filter(p => p.ply <= 30 && p.label !== 'book').map(p => moveAccuracy(p.loss))))
    const first = r.mine.find(p => p.loss >= 0.1 && ERRORS.has(p.label))
    if (first && first.ply <= 30) o.errors.push(Math.ceil(first.ply / 2))
  }
  const openings: OpeningStat[] = [...openingMap.values()]
    .filter(o => o.scores.length >= 2)
    .sort((a, b) => b.scores.length - a.scores.length)
    .slice(0, 8)
    .map(o => ({
      name: o.name,
      color: o.color,
      games: o.scores.length,
      score: Math.round(mean(o.scores) * 100),
      accuracy: Math.round(mean(o.acc)),
      firstError: o.errors.length ? Math.round(mean(o.errors)) : null,
    }))

  const trend = rows.slice(-60).map(r => ({ t: r.game.endTime, perf: r.game.perf, accuracy: r.game.accuracy ?? 0 }))
  const recent = rows.slice(-20)
  const perfs = recent.map(r => r.game.perf).filter((p): p is number => p !== null)
  const latest = rows.at(-1)

  return {
    games: total,
    analyzed: rows.length,
    perf: perfs.length ? Math.round(mean(perfs) / 10) * 10 : null,
    rating: latest ? latest.game[latest.you].rating : null,
    accuracy: recent.length ? Math.round(mean(recent.map(r => r.game.accuracy ?? 0)) * 10) / 10 : null,
    trend,
    phases,
    motifs: motifList.slice(0, 8),
    conversion,
    resilience,
    time,
    tilt: {
      afterLoss: tilt.after.loss.length >= 3 ? Math.round(mean(tilt.after.loss) * 100) : null,
      afterWin: tilt.after.win.length >= 3 ? Math.round(mean(tilt.after.win) * 100) : null,
    },
    openings,
    focus: focus(motifList, phases, conversion, time, rows.length),
    habits: habitStats(rows.map(r => ({ habits: r.review.habits?.[r.you], plies: r.review.plies.length }))),
  }
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (x: number) => `${Math.round(x * 100)}%`

const habitStats = (rows: { habits: Habits | undefined; plies: number }[]): HabitStat[] => {
  const games = rows.filter((r): r is { habits: Habits; plies: number } => !!r.habits && r.plies >= 30)
  if (games.length < 3) return []
  const hs = games.map(g => g.habits)
  const out: (HabitStat & { weight: number })[] = []
  const add = (s: HabitStat, weight: number) => out.push({ ...s, weight })

  const castled = hs.map(h => h.castled).filter((n): n is number => n !== null)
  const never = 1 - castled.length / hs.length
  const castleAt = avg(castled)
  if (never > 0.3) add({ key: 'castle', title: 'Leaving the king in the center', value: `no castling in ${pct(never)} of games`, verdict: 'bad', advice: 'Castle before move 10 whenever the center can open. A king in the middle turns every check into a crisis.' }, 2 + never)
  else if (castleAt > 11) add({ key: 'castle', title: 'Castling late', value: `around move ${Math.round(castleAt)}`, verdict: 'bad', advice: 'Castle before move 10 whenever the center can open. A king in the middle turns every check into a crisis.' }, 1.5)
  else if (castled.length >= 3 && castleAt <= 8) add({ key: 'castle', title: 'Quick castling', value: `around move ${Math.round(castleAt)}`, verdict: 'good', advice: 'Your king is safe early, which lets you play the middlegame without worries.' }, 0.5)

  const queen = hs.filter(h => h.earlyQueen >= 2).length / hs.length
  if (queen > 0.3) add({ key: 'queen', title: 'Early queen trips', value: `in ${pct(queen)} of games`, verdict: 'bad', advice: 'Bring knights and bishops out first. An early queen gets chased and every retreat hands your opponent a free move.' }, 1.2 + queen)

  const repeats = avg(hs.map(h => h.repeats))
  if (repeats > 1.3) add({ key: 'repeats', title: 'Moving the same piece twice', value: `${repeats.toFixed(1)} times per opening`, verdict: 'bad', advice: 'In the first ten moves, move each piece once unless you win something concrete.' }, repeats)

  const lagging = hs.map(h => h.undeveloped).filter((n): n is number => n !== null)
  const lag = avg(lagging)
  if (lagging.length >= 3 && lag >= 1.2) add({ key: 'develop', title: 'Slow development', value: `${lag.toFixed(1)} minor pieces still at home on move 12`, verdict: 'bad', advice: 'Get all four minor pieces out and your king castled by move 10. Only then start operations.' }, 1 + lag)
  else if (lagging.length >= 3 && lag <= 0.3) add({ key: 'develop', title: 'Fast development', value: 'pieces out by move 12', verdict: 'good', advice: 'You get your army into play quickly. That is the foundation of every good middlegame.' }, 0.4)

  const pushes = avg(hs.map(h => h.shieldPushes))
  if (pushes >= 0.9) add({ key: 'shield', title: 'Loosening your king', value: `${pushes.toFixed(1)} pawn moves in front of it per game`, verdict: 'bad', advice: 'Leave the pawns in front of your castled king alone unless they are part of an attack.' }, 1 + pushes * 0.5)

  const crit = hs.reduce((a, h) => [a[0] + h.critical[0], a[1] + h.critical[1]], [0, 0])
  const routine = hs.reduce((a, h) => [a[0] + h.routine[0], a[1] + h.routine[1]], [0, 0])
  if (crit[1] >= 15 && routine[1] >= 30) {
    const c = crit[0] / crit[1]
    const r = routine[0] / routine[1]
    const value = `${Math.round(c)}s on critical moves, ${Math.round(r)}s on routine ones`
    if (c < r * 1.4) add({ key: 'tempo', title: 'Same speed on critical moves', value, verdict: 'bad', advice: 'When captures, checks or a big decision appear, take three times longer. Pay for it by playing routine moves fast.' }, 2)
    else if (c >= r * 2.2) add({ key: 'tempo', title: 'Slowing down when it matters', value, verdict: 'good', advice: 'You invest time exactly where the game is decided. Strong players do the same.' }, 0.6)
  }

  const shares = hs.map(h => h.openingShare).filter((n): n is number => n !== null)
  const share = avg(shares)
  if (shares.length >= 3 && share > 0.3) add({ key: 'opening-clock', title: 'Burning clock in the opening', value: `${pct(share)} of your time by move 10`, verdict: 'bad', advice: 'Learn your first eight moves well enough to play them in seconds, and save the clock for the middlegame.' }, 1.3 + share)

  const win = hs.reduce((a, h) => [a[0] + h.winning[0], a[1] + h.winning[1]], [0, 0])
  const level = hs.reduce((a, h) => [a[0] + h.level[0], a[1] + h.level[1]], [0, 0])
  if (win[1] >= 40 && level[1] >= 40) {
    const wr = win[0] / win[1]
    const lr = level[0] / level[1]
    if (wr > lr * 1.5 && wr > 0.05) add({ key: 'relax', title: 'Relaxing when ahead', value: `${(wr / Math.max(lr, 0.01)).toFixed(1)}x more errors when winning`, verdict: 'bad', advice: 'When you are winning your only job is safety. Check their threats, trade pieces and take no risks.' }, 2.2)
    else if (wr < lr * 0.7) add({ key: 'relax', title: 'Calm when ahead', value: `${pct(wr)} errors when winning`, verdict: 'good', advice: 'You stay careful once you have an advantage. That is how games get won.' }, 0.5)
  }

  const allowed = hs.reduce((a, h) => a + h.allowed, 0)
  const missed = hs.reduce((a, h) => a + h.missed, 0)
  if (allowed + missed >= 8) {
    if (allowed / (allowed + missed) >= 0.65) add({ key: 'threats', title: 'Missing their threats', value: `${pct(allowed / (allowed + missed))} of your tactical errors`, verdict: 'bad', advice: 'After every opponent move, ask what it attacks and what it threatens before thinking about your own plan.' }, 2.4)
    else if (missed / (allowed + missed) >= 0.65) add({ key: 'chances', title: 'Missing your own chances', value: `${pct(missed / (allowed + missed))} of your tactical errors`, verdict: 'bad', advice: 'Before every move, look at your checks and captures first. Tactics hide in forcing moves.' }, 2)
  }

  return out
    .sort((a, b) => (a.verdict === b.verdict ? b.weight - a.weight : a.verdict === 'bad' ? -1 : 1))
    .slice(0, 6)
    .map(({ weight: _, ...h }) => h)
}

const FIX: Record<Motif, string> = {
  hanging: 'Blunder-check every move: what does it leave undefended, and what did their last move attack?',
  fork: 'Drill knight and queen forks until you see the double attack one move before it lands.',
  pin: 'Keep your king and queen off open lines, and break pins with tempo instead of waiting.',
  skewer: 'Step your king and queen off shared lines before a long-range piece arrives.',
  discovered: 'Watch the pieces standing in front of their rooks and bishops: they can move with a threat.',
  defender: 'Ask which of your pieces holds everything together, and give it backup.',
  trapped: 'Before a piece goes deep, count its escape squares.',
  mate: 'Count attackers against defenders near your king every move.',
  backRank: 'Make a breathing square for your king once the center opens.',
  promotion: 'Blockade passed pawns early with a piece directly in front.',
  intermezzo: 'Before recapturing on autopilot, look for a check or threat in between.',
  kingSafety: 'Keep the pawns in front of your castled king still unless you are attacking.',
  structure: 'Before every pawn move, ask which square it weakens forever.',
  activity: 'In quiet positions, improve your worst piece before starting anything.',
  development: 'Develop every minor piece and castle before move 10.',
  endgame: 'Activate your king the moment queens come off.',
}

const weakness = (s: MotifStat, games: number) =>
  POSITIONAL.includes(s.motif)
    ? s.allowed * 0.1
    : Math.max(0, s.missed - s.expected) + s.allowed * 0.6 + (s.allowed + s.missed) / Math.max(games, 1)

const PLURAL: Record<Motif, string> = {
  mate: 'mating attacks',
  backRank: 'back-rank mates',
  hanging: 'free pieces',
  fork: 'forks',
  pin: 'pins',
  skewer: 'skewers',
  discovered: 'discovered attacks',
  defender: 'defenders',
  trapped: 'trapped pieces',
  promotion: 'promotions',
  intermezzo: 'in-between moves',
  kingSafety: 'attacks on your king',
  structure: 'pawn weaknesses',
  activity: 'positional edges',
  development: 'development races',
  endgame: 'endgame edges',
}

const focus = (
  motifs: MotifStat[],
  phases: { accuracy: number; moves: number }[],
  conversion: Insights['conversion'],
  time: Insights['time'],
  games: number,
): Focus[] => {
  const out: (Focus & { weight: number })[] = []
  for (const s of motifs.slice(0, 4)) {
    const w = weakness(s, games)
    if (w <= 0.3) continue
    const why =
      s.chances >= 3 && s.missed - s.expected >= s.allowed * 0.6
        ? `You missed ${s.missed} of ${s.chances}. Players at your level miss about ${Math.round(s.expected)}.`
        : `You gave away ${s.allowed} ${PLURAL[s.motif]} in ${games} games.`
    out.push({ key: s.motif, title: MOTIFS[s.motif].name, why, fix: FIX[s.motif], theme: MOTIFS[s.motif].puzzle, weight: w })
  }
  const pressureRate = time.pressureMoves ? time.pressureErrors / time.pressureMoves : 0
  const calmRate = time.calmMoves ? time.calmErrors / time.calmMoves : 0
  if (time.pressureMoves >= 15 && pressureRate > calmRate * 1.8 && pressureRate > 0.08)
    out.push({
      key: 'time',
      title: 'Clock management',
      why: `${Math.round(pressureRate * 100)}% of your moves low on time are errors, against ${Math.round(calmRate * 100)}% otherwise.`,
      fix: 'Play the opening fast from memory and spend your time only when captures and checks appear.',
      theme: 'short',
      weight: 1.6 + pressureRate * 4,
    })
  if (conversion.chances >= 4 && conversion.converted / conversion.chances < 0.65)
    out.push({ key: 'conversion', title: 'Converting wins', why: `You won ${conversion.converted} of ${conversion.chances} winning positions.`, fix: 'When ahead, trade pieces, keep it simple and check every threat before your own ideas.', theme: 'crushing', weight: 1.3 })
  if (phases[2].moves >= 40 && phases[2].accuracy < Math.min(phases[0].accuracy, phases[1].accuracy) - 8)
    out.push({ key: 'endgame', title: 'Endgame technique', why: `Your endgame accuracy is ${phases[2].accuracy}%, well below the rest of your game.`, fix: 'Bring your king to the center as soon as queens come off and push passed pawns together with it.', theme: 'endgame', weight: 1.2 })
  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map(({ weight: _, ...f }) => f)
}

