export const BOARDS = {
  brown: { light: '#f0d9b5', dark: '#b58863' },
  walnut: { light: '#e6cba3', dark: '#8d6446' },
  graphite: { light: '#d9d6d0', dark: '#86827b' },
  olive: { light: '#e8e6c8', dark: '#99955f' },
} as const

export const PIECE_SETS = ['cburnett', 'merida'] as const

export type BoardTheme = keyof typeof BOARDS
export type PieceSet = (typeof PIECE_SETS)[number]

interface Settings {
  board: BoardTheme
  pieces: PieceSet
  sound: boolean
  coords: boolean
}

const KEY = 'pip.settings.v3'
const stored = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
  } catch {
    return {}
  }
})()

export const settings = $state<Settings>({ board: 'brown', pieces: 'cburnett', sound: true, coords: true, ...stored })
if (!(settings.board in BOARDS)) settings.board = 'brown'
if (!PIECE_SETS.includes(settings.pieces)) settings.pieces = 'cburnett'

const ROLES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' } as const

const pieceCss = (set: PieceSet) =>
  (['w', 'b'] as const)
    .flatMap(c =>
      Object.entries(ROLES).map(
        ([letter, role]) => `.cg-wrap piece.${role}.${c === 'w' ? 'white' : 'black'}{background-image:url('/pieces/${set}/${c}${letter}.svg')}`,
      ),
    )
    .join('')

$effect.root(() => {
  const style = document.createElement('style')
  document.head.append(style)
  $effect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings))
    const { light, dark } = BOARDS[settings.board]
    document.documentElement.style.setProperty('--sq-light', light)
    document.documentElement.style.setProperty('--sq-dark', dark)
    style.textContent = pieceCss(settings.pieces)
  })
})
