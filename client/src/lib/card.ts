import { BOARDS } from './settings.svelte.ts'
import type { Color, Label } from '../../../shared/types.ts'

export interface CardPlayer {
  name: string
  rating: number | null
  accuracy: number | null
  counts: Partial<Record<Label, number>>
}

export interface CardData {
  fen: string
  orientation: Color
  last: string | null
  mark: { square: string; label: Label } | null
  title: string
  subtitle: string
  white: CardPlayer
  black: CardPlayer
  footer: string
}

const W = 1200
const H = 630
const BOARD = 510
const SHOWN: Label[] = ['brilliant', 'great', 'best', 'mistake', 'blunder']
const GLYPH: Partial<Record<Label, string>> = { brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', blunder: '??', miss: '✕' }

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

const images = new Map<string, Promise<HTMLImageElement>>()
const image = (src: string) => {
  let hit = images.get(src)
  if (!hit) {
    hit = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
    images.set(src, hit)
  }
  return hit
}

const squareXY = (square: string, orientation: Color, size: number) => {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 7 - rank : rank
  return [col * size, row * size] as const
}

const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

const fit = (ctx: CanvasRenderingContext2D, text: string, width: number) => {
  if (ctx.measureText(text).width <= width) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > width) out = out.slice(0, -1)
  return `${out.trimEnd()}…`
}

const star = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const d = i % 2 ? r * 0.45 : r
    ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d)
  }
  ctx.closePath()
  ctx.fill()
}

const glyph = (ctx: CanvasRenderingContext2D, label: Label, cx: number, cy: number, r: number, font: string) => {
  ctx.fillStyle = css(`--d-${label}`, '#555')
  ctx.beginPath()
  ctx.arc(cx, cy + r * 0.12, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = css(`--c-${label}`, '#888')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  if (label === 'best') return star(ctx, cx, cy, r * 0.58)
  ctx.font = `900 ${Math.round(r * (GLYPH[label]!.length > 1 ? 0.95 : 1.15))}px ${font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(GLYPH[label]!, cx, cy + r * 0.06)
}

const drawBoard = async (ctx: CanvasRenderingContext2D, data: CardData, x: number, y: number) => {
  const size = BOARD / 8
  const { light, dark } = BOARDS.brown
  ctx.save()
  rounded(ctx, x, y, BOARD, BOARD, 22)
  ctx.clip()
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r + c) % 2 ? dark : light
      ctx.fillRect(x + c * size, y + r * size, size, size)
    }
  if (data.last)
    for (const sq of [data.last.slice(0, 2), data.last.slice(2, 4)]) {
      const [sx, sy] = squareXY(sq, data.orientation, size)
      ctx.fillStyle = 'rgb(242 181 68 / 0.45)'
      ctx.fillRect(x + sx, y + sy, size, size)
    }
  const rows = data.fen.split(' ')[0].split('/')
  const jobs: Promise<void>[] = []
  rows.forEach((row, r) => {
    let file = 0
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch)
        continue
      }
      const square = `${String.fromCharCode(97 + file)}${8 - r}`
      const name = `${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toUpperCase()}`
      const [sx, sy] = squareXY(square, data.orientation, size)
      jobs.push(image(`/pieces/cburnett/${name}.svg`).then(img => ctx.drawImage(img, x + sx, y + sy, size, size)))
      file++
    }
  })
  await Promise.all(jobs)
  ctx.restore()
  if (data.mark) {
    const [sx, sy] = squareXY(data.mark.square, data.orientation, size)
    glyph(ctx, data.mark.label, x + sx + size - 6, y + sy + 6, 19, css('--font', 'sans-serif'))
  }
}

const drawPlayer = (ctx: CanvasRenderingContext2D, p: CardPlayer, side: Color, x: number, y: number, display: string, body: string) => {
  ctx.fillStyle = '#141415'
  rounded(ctx, x, y, 520, 150, 26)
  ctx.fill()
  ctx.strokeStyle = '#29292c'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = side === 'white' ? '#f4f1ea' : '#2a2a2d'
  ctx.beginPath()
  ctx.arc(x + 38, y + 44, 13, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#5a5a60'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#f4f1ea'
  ctx.font = `800 30px ${body}`
  const name = fit(ctx, p.name, 250)
  const nameWidth = ctx.measureText(name).width
  ctx.fillText(name, x + 64, y + 55)
  if (p.rating) {
    ctx.fillStyle = '#6f6b64'
    ctx.font = `700 24px ${body}`
    ctx.fillText(String(p.rating), x + 64 + nameWidth + 12, y + 55)
  }
  ctx.textAlign = 'right'
  ctx.fillStyle = '#f2b544'
  ctx.font = `700 64px ${display}`
  ctx.fillText(p.accuracy === null ? '–' : p.accuracy.toFixed(1), x + 494, y + 78)
  ctx.fillStyle = '#aaa59c'
  ctx.font = `800 17px ${body}`
  ctx.fillText('ACCURACY', x + 494, y + 106)
  let cx = x + 38
  for (const label of SHOWN) {
    const n = p.counts[label] ?? 0
    glyph(ctx, label, cx, y + 112, 15, body)
    ctx.textAlign = 'left'
    ctx.fillStyle = n ? '#f4f1ea' : '#4a4a4f'
    ctx.font = `900 24px ${body}`
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), cx + 22, y + 114)
    ctx.textBaseline = 'alphabetic'
    cx += 70
  }
}

export const renderCard = async (data: CardData) => {
  await document.fonts.ready
  const display = css('--display', css('--font', 'sans-serif'))
  const body = css('--font', 'sans-serif')
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0b0b0c'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(300, 315, 40, 300, 315, 520)
  glow.addColorStop(0, 'rgb(242 181 68 / 0.10)')
  glow.addColorStop(1, 'rgb(242 181 68 / 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  await drawBoard(ctx, data, 50, 60)
  const x = 620
  ctx.textAlign = 'left'
  ctx.fillStyle = '#f2b544'
  ctx.font = `700 40px ${display}`
  ctx.fillText('pip', x, 96)
  ctx.fillStyle = '#6f6b64'
  ctx.font = `800 18px ${body}`
  ctx.fillText('FREE CHESS COACH', x + 70, 92)
  ctx.fillStyle = '#f4f1ea'
  ctx.font = `700 34px ${display}`
  ctx.fillText(fit(ctx, data.title, 520), x, 150)
  ctx.fillStyle = '#aaa59c'
  ctx.font = `700 22px ${body}`
  ctx.fillText(fit(ctx, data.subtitle, 520), x, 184)
  drawPlayer(ctx, data.white, 'white', x, 214, display, body)
  drawPlayer(ctx, data.black, 'black', x, 380, display, body)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#6f6b64'
  ctx.font = `700 19px ${body}`
  ctx.fillText(data.footer, x, 588)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'))
}
