import { makeSquare } from 'chessops/util'
import type { Finding, Piece } from './tactics.ts'
import type { Threat, Trait } from './positional.ts'
import type { Role } from 'chessops/types'

const at = (p: Piece) => `${p.role} on ${makeSquare(p.sq)}`
const pair = (ps: Piece[]) => ps.map(p => p.role).join(' and ')

export const ROLE_NAME: Record<Role, string> = { pawn: 'pawn', knight: 'knight', bishop: 'bishop', rook: 'rook', queen: 'queen', king: 'king' }

export const allowed = (f: Finding, reply: string, movedTo: number) => {
  const [a, b] = f.targets
  switch (f.motif) {
    case 'mate': return f.mate === 1 ? `Allows ${reply}, mate.` : `Allows a forced mate in ${f.mate}, starting ${reply}.`
    case 'backRank': return `Your back rank is weak. ${reply} leads to mate.`
    case 'hanging': return a.sq === movedTo ? `Your ${a.role} isn't safe on ${makeSquare(a.sq)}. ${reply} takes it.` : `Leaves your ${at(a)} undefended. ${reply} takes it.`
    case 'fork': return `Allows ${reply}, forking your ${pair(f.targets)}.`
    case 'discovered': return `Allows ${reply}, a discovered attack on your ${a.role}.`
    case 'skewer': return `Allows ${reply}, skewering your ${pair(f.targets)}.`
    case 'pin': return `Allows ${reply}, pinning your ${a.role} to your ${b.role}.`
    case 'defender': return `Allows ${reply}, removing the defender of your ${b.role}.`
    case 'trapped': return `Your ${a.role} gets trapped after ${reply}.`
    case 'promotion': return `Lets their pawn through. ${reply} and it promotes.`
    default: return a ? `${reply} wins your ${a.role}.` : `${reply} wins material.`
  }
}

export const missed = (f: Finding, best: string) => {
  const [a, b] = f.targets
  switch (f.motif) {
    case 'mate': return f.mate === 1 ? `${best} was mate.` : `You had mate in ${f.mate}, starting ${best}.`
    case 'backRank': return `Their back rank was weak. ${best} mates.`
    case 'hanging': return `The ${at(a)} was free. ${best} takes it.`
    case 'fork': return `${best} forks the ${pair(f.targets)}.`
    case 'discovered': return `${best} unleashes a discovered attack on the ${a.role}.`
    case 'skewer': return `${best} skewers the ${pair(f.targets)}.`
    case 'pin': return `${best} pins the ${a.role} to the ${b.role}.`
    case 'defender': return `${best} removes the defender of the ${b.role}.`
    case 'trapped': return `${best} traps the ${a.role}.`
    case 'promotion': return `${best} and your pawn promotes.`
    default: return a ? `${best} wins the ${a.role}.` : `${best} wins material.`
  }
}

export const positional = (trait: Trait, san: string, best: string, bestRole: Role, bestIsKing: boolean, castles: boolean) => {
  switch (trait) {
    case 'king': return castles ? `King safety first: ${best}.` : `${san} loosens the shelter around your king.`
    case 'development': return `${best} develops a piece. ${san} costs time.`
    case 'activity': return best.includes('x') ? `Trading with ${best} was the cleaner way.` : `${best} puts your ${ROLE_NAME[bestRole]} on a better square.`
    case 'structure': return `${san} leaves you with weak pawns.`
    case 'passed': return `${best} makes more of the passed pawns.`
    case 'center': return `${best} fights for the center.`
    case 'kingActivity': return bestIsKing ? `Endgame: the king is a fighter. ${best}.` : `${best} keeps your king in the game.`
  }
}

export const threat = (t: Threat, reply: string) => {
  switch (t.kind) {
    case 'pressure': return `After ${reply} your ${ROLE_NAME[t.role]} on ${makeSquare(t.sq)} comes under fire.`
    case 'storm': return `Allows ${reply}. Their pawns start rolling toward your king.`
    case 'space': return `Allows ${reply}, and they take over the center.`
    case 'entry': return `Allows ${reply}, breaking into your position.`
  }
}

export const subtle = (best: string, reply: string | null) => (reply ? `${best} was more precise. Now ${reply} is strong.` : `${best} was more precise.`)

export const great = (ep: number) => (ep >= 0.6 ? 'The only move that keeps your edge.' : ep >= 0.4 ? 'The only move that holds the balance.' : 'The only move that keeps you fighting.')

export const brilliant = (role: Role) => `A sound ${ROLE_NAME[role]} sacrifice. Hard to find.`

export const miss = (opponent: string, text: string) => `${opponent} was an error. ${text}`
