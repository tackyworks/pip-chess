export interface Landing {
  path: string
  label: string
  title: string
  description: string
  headline: [string, string, string]
  lead: string
}

export const LANDINGS: Landing[] = [
  {
    path: '/',
    label: 'Free chess coach',
    title: 'Pip · Free chess game review and coach',
    description:
      'Free, unlimited chess game review for chess.com and Lichess. Pip explains your mistakes like a coach, finds your habits, builds your opening repertoire and trains you with puzzles from your own games.',
    headline: ['The chess coach that ', 'actually explains', ' your mistakes.'],
    lead: 'Pip reviews your games move by move, finds the habits that cost you points and trains you on exactly those.',
  },
  {
    path: '/free-chess-game-review',
    label: 'Free game review',
    title: 'Free Chess Game Review, Unlimited and No Sign-up · Pip',
    description:
      'Unlimited free chess game reviews with move labels, accuracy, coach notes and key moments. Works with chess.com and Lichess usernames. No paywall and no account.',
    headline: ['Unlimited chess game reviews. ', 'Free', ', for good.'],
    lead: 'Every game, every move, every key moment. Pip labels your moves, explains what you missed and never asks for a card.',
  },
  {
    path: '/chess-com-game-review',
    label: 'chess.com game review',
    title: 'Free chess.com Game Review Without a Membership · Pip',
    description:
      'Review your chess.com games for free: accuracy, brilliant moves, blunders, coach notes and training from your own mistakes. Just type your chess.com username.',
    headline: ['Review your chess.com games ', 'without a membership', '.'],
    lead: 'Type your chess.com username and Pip reviews your recent games for free, with a coach’s notes on every one.',
  },
  {
    path: '/lichess-game-analysis',
    label: 'Lichess game analysis',
    title: 'Lichess Game Analysis With a Coach’s Notes · Pip',
    description:
      'Turn Lichess computer analysis into coaching. Pip explains the tactic behind every mistake, tracks your habits across games and builds an opening repertoire from your Lichess games.',
    headline: ['Your Lichess games, ', 'explained', ' like a coach would.'],
    lead: 'Pip reads your Lichess games, tells you why a move was bad and what to look for next time, then trains you on it.',
  },
  {
    path: '/chess-opening-trainer',
    label: 'Opening trainer',
    title: 'Chess Opening Trainer Built From Your Own Games · Pip',
    description:
      'A free opening trainer that builds your repertoire from the games you actually play, finds the exact moves where you go wrong and drills them with spaced repetition.',
    headline: ['An opening trainer built from ', 'your own games', '.'],
    lead: 'Pip finds the openings you really play, the moves where you keep slipping, and drills them until they stick.',
  },
  {
    path: '/chess-puzzles-from-your-games',
    label: 'Puzzles from your games',
    title: 'Chess Puzzles From Your Own Mistakes · Pip',
    description:
      'Free chess puzzles made from the mistakes in your own games, mixed with puzzles that target your weakest tactics and scheduled with spaced repetition.',
    headline: ['Puzzles made from ', 'your own mistakes', '.'],
    lead: 'Every mistake Pip finds becomes a puzzle that comes back right before you would forget it.',
  },
]

export const FAQ: [string, string][] = [
  ['Is Pip really free?', 'Yes. Every feature is free: unlimited reviews, coach notes, insights, the opening trainer, puzzles and games against Pip. There is no premium tier.'],
  ['How is it different from a normal game review?', 'Pip compares your moves with what real players at your rating play, explains the tactic or idea behind each mistake, tracks your habits across games and turns your mistakes into training.'],
  ['Do I need an account?', 'No. Pip only needs your public chess.com or Lichess username to fetch your games.'],
  ['How accurate is the analysis?', 'Every move is checked by Stockfish 19 with its full neural network, and every suspected mistake is searched again much deeper before it gets a label.'],
  ['What does "played like 1600" mean?', 'An estimate of the strength you showed in that game, based on how human players at each rating would have played. It is noisy for one game and reliable over many.'],
  ['Where is my data stored?', 'In your own browser. The analysis runs on your device, so your games and progress never sit on a server.'],
  ['Why does the first visit take a moment?', 'Pip downloads Stockfish and its human move model once, then keeps them on your device. After that, everything starts instantly.'],
]

export const FEATURES: [string, string][] = [
  ['Reviews that explain', 'Not just "blunder". Pip names the fork, the pin or the plan you missed and how to spot it next time.'],
  ['Your opening repertoire', 'Built from your own games, with the exact moves where you go wrong and drills to fix them.'],
  ['Habits, not just games', 'Castling late? Rushing critical moves? Pip finds the patterns across all your games.'],
  ['Training that sticks', 'Your mistakes become puzzles that come back right before you would forget them.'],
]

export const landingFor = (path: string) => LANDINGS.find(l => l.path === (path.replace(/(.)\/+$/, '$1') || '/')) ?? LANDINGS[0]
