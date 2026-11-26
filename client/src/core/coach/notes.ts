import type { Motif } from '../../../../shared/themes.ts'
import type { Color, Notes, Ply } from '../../../../shared/types.ts'

const pick = (options: string[], seed: number) => options[seed % options.length]

const ALLOWED: Partial<Record<Motif, string[]>> = {
  hanging: [
    'Blunder check before you let go of the piece: what does this move leave undefended?',
    'Count attackers and defenders on every square your pieces stand on. One loose piece is all a tactic needs.',
  ],
  fork: [
    'Pieces standing a knight jump apart are fork targets. Keep your king, queen and rooks on squares a single piece cannot hit together.',
    'Before each move, look for squares where one enemy piece could attack two of yours at once.',
  ],
  pin: ['Never line up your king or queen behind another piece on an open line. A pinned piece is a frozen piece.'],
  skewer: ['When your king or queen shares a line with another piece, a long-range piece can skewer both. Step off the line early.'],
  discovered: ['When an enemy piece stands in front of their rook, bishop or queen, ask what happens if it moves away with tempo.'],
  defender: ['Notice which of your pieces does two jobs at once. Overloaded defenders are the first thing a strong player attacks.'],
  trapped: ['Before you send a piece deep into enemy territory, make sure it still has a road home.'],
  mate: ['When enemy pieces gather near your king, count attackers against defenders every single move.'],
  backRank: ['Give your king a breathing square (h3, g3 or h6) once the position calms down. Back-rank mates come from nowhere.'],
  promotion: ['A passed pawn wants to run. Blockade it with a piece the moment it becomes passed.'],
}

const MISSED: Partial<Record<Motif, string[]>> = {
  hanging: ['After every opponent move, first ask: did that leave something of theirs undefended?'],
  fork: ['Look for squares where one of your pieces attacks two targets at once. Knights and queens love forks.'],
  pin: ['A piece in front of a king or queen cannot really move. Attack it again and it often falls.'],
  skewer: ['When their king or queen stands in line with another piece, check if a rook, bishop or queen can hit through.'],
  discovered: ['A piece in front of your own long-range piece is a loaded gun. Move it with a threat and two attacks happen at once.'],
  defender: ['Find the piece holding their position together and remove it.'],
  trapped: ['Count the escape squares of their active pieces. A piece with no retreat can often be hunted down.'],
  mate: ['When the enemy king is short of squares, look at every check first, even the ones that look like sacrifices.'],
  backRank: ['If their king has no breathing square, every check on the back rank deserves a look.'],
  promotion: ['When your pawn is close to queening, look for ways to deflect the blocker.'],
}

const POSITIONAL: Partial<Record<Motif, string[]>> = {
  kingSafety: ['Pawn moves in front of your castled king can never be taken back. Make them only with a concrete reason.'],
  development: ['In the opening every move should develop a new piece or fight for the center. Moving the same piece twice costs a tempo.'],
  activity: ['When nothing is happening, find your worst-placed piece and improve it.', 'Put your pieces where they attack the most squares, then look for a plan.'],
  structure: ['Pawns cannot move backwards. Every pawn move creates a weak square somewhere; ask which one before you push.'],
  endgame: ['In the endgame your king becomes a strong piece. Centralize it before anything else.'],
}

const GENERIC = 'Before every move run the checklist: checks, captures and threats for your opponent, then for you.'

const timeTight = (p: Ply, base: number | null) => base !== null && p.clock !== null && p.clock + (p.spent ?? 0) < Math.max(30, base * 0.1)

export const tipFor = (p: Ply, base: number | null) => {
  if (p.spent !== null && p.spent < 3 && p.chance && p.loss >= 0.1 && !timeTight(p, base))
    return `This was a critical position and you moved in ${Math.max(1, Math.round(p.spent))}s. When captures and checks are in the air, slow down.`
  if (p.label === 'miss') return 'When your opponent plays a surprising move, ask what it allows before you continue your own plan.'
  if (p.cause === 'positional' && p.motif === 'kingSafety' && !/^[a-h]/.test(p.san))
    return 'Before a quiet move, ask what your opponent would play next against your king. Keep defenders close and lines closed.'
  const bank = p.cause === 'allowed' ? ALLOWED : p.cause === 'missed' ? MISSED : POSITIONAL
  const options = p.motif ? bank[p.motif] : undefined
  return options ? pick(options, p.ply) : GENERIC
}

const mv = (p: Ply) => `${Math.ceil(p.ply / 2)}${p.color === 'white' ? '.' : '...'}${p.san}`
const list = (ps: Ply[]) => ps.map(p => Math.ceil(p.ply / 2)).join(', ')

const NOUN: Partial<Record<Motif, [string, string]>> = {
  hanging: ['left a piece undefended', 'Leaving pieces loose'],
  fork: ['walked into a fork', 'Forks'],
  pin: ['got pinned', 'Pins'],
  skewer: ['got skewered', 'Skewers'],
  discovered: ['missed a discovered attack', 'Discovered attacks'],
  defender: ['lost a key defender', 'Overloaded defenders'],
  trapped: ['let a piece get trapped', 'Trapped pieces'],
  mate: ['allowed a mating attack', 'King safety'],
  backRank: ['allowed a back-rank threat', 'Back-rank weakness'],
  promotion: ['let a pawn run', 'Passed pawns'],
  kingSafety: ['let their attack on your king get going', 'King safety'],
  development: ['lost time in the opening', 'Development'],
  activity: ['let your pieces go passive', 'Piece activity'],
  structure: ['created pawn weaknesses', 'Pawn structure'],
  endgame: ['misplayed the endgame', 'Endgame technique'],
}

const NEXT: Partial<Record<Motif, string>> = {
  hanging: 'Before you click, look at the piece you just moved and every piece it was defending.',
  fork: 'After every opponent move, check every square their knights and queen can jump to next.',
  pin: 'Before moving a piece off a line, look behind it: what was it shielding?',
  mate: 'Every move, glance at your king first and count the attackers near it.',
  backRank: 'Once you castle and the center opens, make one quiet luft move for your king.',
  development: 'Get all four minor pieces out and castle before move 10. No pawn grabs before that.',
  kingSafety: 'Leave the three pawns in front of your castled king alone unless you are attacking with them.',
}

export const gameNotes = (plies: Ply[], you: Color, result: string, base: number | null, plan: string | null): Notes | null => {
  if (plies.length < 14) return null
  const mine = plies.filter(p => p.color === you)
  const theirs = plies.filter(p => p.color !== you)
  const score = result === '1/2-1/2' ? 0.5 : result === (you === 'white' ? '1-0' : '0-1') ? 1 : 0
  const ep = (p: Ply) => (you === 'white' ? p.white : 1 - p.white)
  const errors = mine.filter(p => p.loss >= 0.1 && p.label !== 'book')
  const theirErrors = theirs.filter(p => p.loss >= 0.15)
  const turn = errors.reduce<Ply | null>((a, p) => (!a || p.loss > a.loss ? p : a), null)
  const gift = theirErrors.reduce<Ply | null>((a, p) => (!a || p.loss > a.loss ? p : a), null)

  const afterOpening = plies.find(p => p.phase >= 1) ?? plies[Math.min(plies.length - 1, 24)]
  const start = ep(afterOpening)
  const opening = start >= 0.62 ? 'You came out of the opening better' : start <= 0.38 ? 'You came out of the opening worse' : 'The opening was balanced'
  const ending = score === 1 ? 'you brought it home' : score === 0.5 ? 'it ended level' : 'you could not hold it'
  let story = `${opening}.`
  if (turn && turn.loss >= 0.2 && (!gift || turn.loss >= gift.loss)) story += ` The game turned on ${mv(turn)}${score < 1 ? '' : ', but you recovered'}, and ${ending}.`
  else if (gift) story += ` Your opponent cracked with ${mv(gift)} and ${ending}.`
  else if (start >= 0.62) story += score === 1 ? ' You kept the pressure on and won.' : ' You could not make that edge count.'
  else if (start <= 0.38) story += score === 1 ? ' You turned it around anyway.' : ' You never quite got back into it.'
  else story += ` It stayed tight and ${ending}.`

  const good: string[] = []
  const early = errors.find(p => p.ply <= 24)
  if (!early && mine.length >= 12) good.push('A clean opening: no real errors in the first 12 moves.')
  const finds = mine.filter(p => p.label === 'great' || p.label === 'brilliant')
  if (finds.length) good.push(`You found ${finds.length === 1 ? 'a hard move' : `${finds.length} hard moves`} that most players miss (move ${list(finds)}).`)
  const punished = theirErrors.filter(t => {
    const reply = plies[t.ply]
    return reply && reply.color === you && reply.loss <= 0.02
  })
  if (punished.length) good.push(`When your opponent slipped on move ${list(punished)}, you punished it right away.`)
  const lowStretch = mine.filter(p => ep(p) <= 0.3).length
  if (lowStretch >= 6 && score >= 0.5) good.push('You kept fighting in a worse position and it paid off.')
  if (base && !errors.some(p => timeTight(p, base)) && mine.some(p => p.clock !== null)) good.push('Good clock control: no errors in time trouble.')

  type Work = { text: string; tip: string; weight: number; next: string }
  const work: Work[] = []
  const groups = new Map<string, Ply[]>()
  for (const p of errors) {
    if (!p.motif) continue
    const key = `${p.cause}:${p.motif}`
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  for (const [key, ps] of groups) {
    const [cause, motif] = key.split(':') as ['allowed' | 'missed' | 'positional', Motif]
    const noun = NOUN[motif]
    const weight = ps.reduce((a, p) => a + p.loss, 0)
    if (!noun) continue
    const text =
      cause === 'missed'
        ? ps.length > 1
          ? `You missed ${ps.length} winning ${noun[1].toLowerCase()} (moves ${list(ps)}).`
          : `On move ${list(ps)} you missed a winning shot: ${noun[1].toLowerCase()}.`
        : ps.length > 1
          ? `${ps.length} times you ${noun[0]} (moves ${list(ps)}).`
          : `On move ${list(ps)} you ${noun[0]}.`
    work.push({ text, tip: tipFor(ps[0], base), weight, next: NEXT[motif] ?? 'Every move, check what your opponent threatens before you look at your own ideas.' })
  }
  const pressure = errors.filter(p => timeTight(p, base))
  if (pressure.length >= 2)
    work.push({
      text: `${pressure.length} of your errors came with under ${Math.max(30, Math.round((base ?? 0) * 0.1))} seconds left.`,
      tip: 'Play your known opening moves fast and bank the time for the moments with captures and checks.',
      weight: pressure.reduce((a, p) => a + p.loss, 0) + 0.2,
      next: 'Keep at least a third of your clock for the middlegame. Play the opening on autopilot.',
    })
  const peak = mine.find(p => ep(p) >= 0.85 && p.ply > 16)
  if (peak && score < 1)
    work.push({
      text: `You were winning around move ${Math.ceil(peak.ply / 2)} and let it slip.`,
      tip: 'When you are ahead, slow down. Trade pieces, keep it simple, and check every opponent threat before your own ideas.',
      weight: 0.9,
      next: 'When you get a winning position, spend your next three moves only on safety: threats, loose pieces, king.',
    })

  work.sort((a, b) => b.weight - a.weight)
  const top = work.slice(0, 2)
  const next = top[0]?.next ?? (score === 1 ? 'Keep the same routine: it worked. Check every capture twice.' : 'Pick one moment from this game and replay it until the right move feels natural.')
  return { story, good: good.slice(0, 2), work: top.map(({ text, tip }) => ({ text, tip })), plan, next }
}
