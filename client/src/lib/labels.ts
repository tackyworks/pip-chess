import type { Label, Mood } from '../../../shared/types.ts'

export interface LabelMeta {
  name: string
  glyph: string
  mood: Mood
  notable: boolean
}

export const LABELS: Record<Label, LabelMeta> = {
  brilliant: { name: 'Brilliant', glyph: '!!', mood: 'star', notable: true },
  great: { name: 'Great find', glyph: '!', mood: 'proud', notable: true },
  best: { name: 'Best', glyph: 'star', mood: 'happy', notable: false },
  excellent: { name: 'Excellent', glyph: 'thumb', mood: 'happy', notable: false },
  good: { name: 'Good', glyph: 'check', mood: 'ok', notable: false },
  book: { name: 'Book', glyph: 'book', mood: 'read', notable: false },
  forced: { name: 'Forced', glyph: 'arrow', mood: 'ok', notable: false },
  inaccuracy: { name: 'Inaccuracy', glyph: '?!', mood: 'hmm', notable: true },
  mistake: { name: 'Mistake', glyph: '?', mood: 'worried', notable: true },
  miss: { name: 'Missed win', glyph: 'x', mood: 'sad', notable: true },
  blunder: { name: 'Blunder', glyph: '??', mood: 'shock', notable: true },
}

export const color = (label: Label) => `var(--c-${label})`

export const ERRORS: Label[] = ['inaccuracy', 'mistake', 'miss', 'blunder']
