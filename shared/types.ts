import type { Motif } from './themes.ts'

export type Color = 'white' | 'black'

export type Label =
  | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'forced'
  | 'inaccuracy' | 'mistake' | 'miss' | 'blunder'

export type Mood =
  | 'idle' | 'think' | 'happy' | 'star' | 'proud' | 'ok' | 'read'
  | 'hmm' | 'worried' | 'shock' | 'sad' | 'cheer' | 'oops' | 'sleep'

export interface Line {
  uci: string
  ep: number
  cp?: number
  mate?: number
  depth: number
  pv: string[]
}

export interface Chance {
  motif: Motif | null
  found: boolean
  ease: number
}

export interface Ply {
  ply: number
  color: Color
  san: string
  uci: string
  fen: string
  white: number
  cp: number | null
  mate: number | null
  loss: number
  label: Label
  best: { san: string; uci: string; line: string[] } | null
  reply: { uci: string; line: string[] } | null
  human: number | null
  clock: number | null
  spent: number | null
  motif: Motif | null
  cause: 'allowed' | 'missed' | 'positional' | null
  note: string | null
  tip: string | null
  chance: Chance | null
  phase: 0 | 1 | 2
}

export interface Moment {
  ply: number
  tone: 'good' | 'bad' | 'turn'
}

export interface Side {
  accuracy: number
  perf: number | null
  counts: Partial<Record<Label, number>>
}

export interface Notes {
  story: string
  good: string[]
  work: { text: string; tip: string }[]
  plan: string | null
  next: string
}

export interface Habits {
  castled: number | null
  earlyQueen: number
  repeats: number
  undeveloped: number | null
  shieldPushes: number
  critical: [number, number]
  routine: [number, number]
  openingShare: number | null
  winning: [number, number]
  level: [number, number]
  allowed: number
  missed: number
}

export interface Review {
  version: number
  draft?: boolean
  start: string
  origin: number
  plies: Ply[]
  white: Side
  black: Side
  moments: Moment[]
  takeaways: string[]
  notes: Notes | null
  habits: Record<Color, Habits>
  opening: { eco: string; name: string; until: number } | null
}

export type Status = 'new' | 'queued' | 'analyzing' | 'done' | 'error'

export interface Player {
  name: string
  rating: number
}

export interface GameRow {
  id: string
  url: string | null
  white: Player
  black: Player
  result: string
  you: Color | null
  timeClass: string
  timeControl: string
  endTime: number
  opening: string | null
  status: Status
  accuracy: number | null
  perf: number | null
  moves: number
}

export interface GameDetail {
  game: GameRow
  review: Review | null
  line: { start: string; moves: { san: string; uci: string; fen: string; clock: number | null }[] }
}

export interface Streak {
  days: number
  today: number
  goal: number
  best: number
}

export interface Account {
  key: string
  site: 'chesscom' | 'lichess'
  username: string
}

export interface Me {
  account: Account | null
  streak: Streak
  username: string | null
  rating: number | null
  puzzleRating: number
  games: number
  analyzed: number
}

export type ServerEvent =
  | { type: 'status'; id: string; status: Status }
  | { type: 'progress'; id: string; done: number; total: number; stage: 'quick' | 'scan' | 'verify' | 'human' | 'coach' }
  | { type: 'eval'; id: string; ply: number; white: number }
  | { type: 'reviewed'; id: string; accuracy: number | null; perf: number | null }
  | { type: 'drafted'; id: string }
  | { type: 'synced'; added: number; error?: string }
  | { type: 'repertoire'; color: Color; status: 'building' | 'ready'; done: number; total: number }
  | { type: 'streak'; streak: Streak; goalReached: boolean }
  | { type: 'setup'; what: 'engine' | 'model' | 'ready'; done: number; total: number }
  | { type: 'syncing'; added: number }

export interface PhaseStat {
  accuracy: number
  moves: number
}

export interface MotifStat {
  motif: Motif
  chances: number
  missed: number
  allowed: number
  expected: number
  ratio: number
}

export interface OpeningStat {
  name: string
  color: Color
  games: number
  score: number
  accuracy: number
  firstError: number | null
}

export interface Focus {
  key: Motif | 'time' | 'conversion'
  title: string
  why: string
  fix: string
  theme: string
}

export interface HabitStat {
  key: string
  title: string
  value: string
  verdict: 'good' | 'bad'
  advice: string
}

export interface Insights {
  classes: string[]
  habits: HabitStat[]
  games: number
  analyzed: number
  perf: number | null
  rating: number | null
  accuracy: number | null
  trend: { t: number; perf: number | null; accuracy: number }[]
  phases: PhaseStat[]
  motifs: MotifStat[]
  conversion: { chances: number; converted: number }
  resilience: { chances: number; saved: number }
  time: { pressureMoves: number; pressureErrors: number; calmMoves: number; calmErrors: number; rushed: number }
  tilt: { afterLoss: number | null; afterWin: number | null }
  openings: OpeningStat[]
  focus: Focus[]
}

export interface Card {
  id: string
  kind: 'mistake' | 'puzzle'
  fen: string
  lead: string | null
  moves: string[]
  accept: string[]
  themes: string[]
  rating: number | null
  game: { id: string; ply: number; opponent: string; san: string } | null
  due: number
  reps: number
}

export interface TrainSession {
  due: Card[]
  drills: Card[]
  focus: Focus[]
  puzzleRating: number
  stats: { cards: number; due: number; learned: number }
}

export interface RepMove {
  uci: string
  san: string
  games: number
  score: number | null
  to: string
  prep: boolean
}

export interface RepNode {
  key: string
  fen: string
  ply: number
  mine: boolean
  games: number
  score: number | null
  white: number | null
  opening: string | null
  moves: RepMove[]
  pick: { uci: string; san: string; accept: string[] } | null
  fix: { uci: string; san: string; games: number; loss: number } | null
  prep: boolean
}

export interface Repertoire {
  color: Color
  root: string
  nodes: Record<string, RepNode>
  games: number
  score: number | null
  built: number
}

export interface RepSummary {
  color: Color
  status: 'empty' | 'building' | 'ready'
  games: number
  score: number | null
  positions: number
  fixes: number
  due: number
  line: string[]
  progress: { done: number; total: number } | null
}

export interface DrillStep {
  uci: string
  san: string
  mine: boolean
  id: string | null
  due: boolean
  accept: string[]
}

export interface DrillLine {
  id: string
  fix: boolean
  opening: string | null
  steps: DrillStep[]
}

export interface Result {
  solved: boolean
  hints: number
  ms: number
}
