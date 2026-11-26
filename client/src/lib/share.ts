import { renderCard, type CardData } from './card.ts'
import { LABELS } from './labels.ts'
import type { GameDetail, Ply } from '../../../shared/types.ts'

const STORE = 'pip.shares'

const remembered = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}')
  } catch {
    return {}
  }
}

const highlight = (detail: GameDetail): Ply | null => {
  const plies = detail.review?.plies ?? []
  const you = detail.game.you
  const score = (p: Ply) => {
    const own = !you || p.color === you
    if (p.label === 'brilliant') return own ? 100 : 40
    if (p.label === 'great') return own ? 80 : 30
    if (p.label === 'blunder' || p.label === 'miss') return 60 + p.loss * 10
    if (p.label === 'mistake') return 30 + p.loss * 10
    return 0
  }
  return plies.reduce<Ply | null>((top, p) => (score(p) > (top ? score(top) : 0) ? p : top), null)
}

const RESULTS: Record<string, string> = { '1-0': 'White won', '0-1': 'Black won', '1/2-1/2': 'Draw' }

export const cardFor = (detail: GameDetail): CardData => {
  const { game, review, line } = detail
  const moment = highlight(detail)
  const at = moment ? moment.ply : line.moves.length
  const move = line.moves[at - 1]
  const side = (color: 'white' | 'black') => ({
    name: game[color].name,
    rating: game[color].rating || null,
    accuracy: review?.[color].accuracy ?? null,
    counts: review?.[color].counts ?? {},
  })
  const when = moment ? ` · ${LABELS[moment.label].name} on move ${Math.ceil(moment.ply / 2)}` : ''
  return {
    fen: move?.fen ?? line.start,
    orientation: game.you ?? 'white',
    last: move?.uci ?? null,
    mark: moment ? { square: moment.uci.slice(2, 4), label: moment.label } : null,
    title: review?.opening?.name ?? game.opening ?? 'Game review',
    subtitle: `${RESULTS[game.result] ?? game.result} · ${game.timeClass[0].toUpperCase()}${game.timeClass.slice(1)}${when}`,
    white: side('white'),
    black: side('black'),
    footer: `Free game review at ${location.host}`,
  }
}

export const shareLink = (id: string) => `${location.origin}/r/${id}`

export const share = async (detail: GameDetail) => {
  const saved = remembered()
  const known = saved[detail.game.id]
  if (known) return shareLink(known)
  const card = await renderCard(cardFor(detail))
  const form = new FormData()
  form.set('review', JSON.stringify(detail))
  form.set('card', card, 'card.png')
  const res = await fetch('/api/share', { method: 'POST', body: form }).catch(() => null)
  if (!res || res.status === 404 || res.status === 405) throw new Error('Sharing works on the hosted site.')
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Could not share (${res.status})`)
  const { id } = (await res.json()) as { id: string }
  saved[detail.game.id] = id
  localStorage.setItem(STORE, JSON.stringify(saved))
  return shareLink(id)
}

export const fetchShared = async (id: string) => {
  const res = await fetch(`/api/share/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(res.status === 404 ? 'This review link does not exist or has expired.' : 'Could not load this review.')
  return (await res.json()) as GameDetail
}
