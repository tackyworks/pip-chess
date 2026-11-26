export const PUZZLE_THEMES = [
  'fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'trappedPiece', 'capturingDefender',
  'deflection', 'attraction', 'intermezzo', 'doubleCheck', 'xRayAttack', 'clearance', 'interference',
  'sacrifice', 'quietMove', 'defensiveMove', 'zugzwang', 'promotion', 'advancedPawn', 'exposedKing',
  'kingsideAttack', 'queensideAttack', 'backRankMate', 'smotheredMate', 'mate', 'mateIn1', 'mateIn2',
  'mateIn3', 'opening', 'middlegame', 'endgame', 'rookEndgame', 'pawnEndgame', 'bishopEndgame',
  'knightEndgame', 'queenEndgame', 'oneMove', 'short', 'long', 'veryLong', 'crushing', 'advantage', 'equality',
] as const

export type PuzzleTheme = (typeof PUZZLE_THEMES)[number]

export const MOTIFS = {
  mate: { name: 'Mating attacks', puzzle: 'mate' },
  backRank: { name: 'Back-rank weakness', puzzle: 'backRankMate' },
  hanging: { name: 'Loose pieces', puzzle: 'hangingPiece' },
  fork: { name: 'Forks', puzzle: 'fork' },
  pin: { name: 'Pins', puzzle: 'pin' },
  skewer: { name: 'Skewers', puzzle: 'skewer' },
  discovered: { name: 'Discovered attacks', puzzle: 'discoveredAttack' },
  defender: { name: 'Removing the defender', puzzle: 'capturingDefender' },
  trapped: { name: 'Trapped pieces', puzzle: 'trappedPiece' },
  promotion: { name: 'Pawn promotion', puzzle: 'promotion' },
  intermezzo: { name: 'In-between moves', puzzle: 'intermezzo' },
  kingSafety: { name: 'King safety', puzzle: 'exposedKing' },
  structure: { name: 'Pawn structure', puzzle: 'pawnEndgame' },
  activity: { name: 'Piece activity', puzzle: 'quietMove' },
  development: { name: 'Development', puzzle: 'opening' },
  endgame: { name: 'Endgame technique', puzzle: 'endgame' },
} as const satisfies Record<string, { name: string; puzzle: PuzzleTheme }>

export type Motif = keyof typeof MOTIFS
