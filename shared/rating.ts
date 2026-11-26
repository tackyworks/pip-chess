export const toHuman = (chesscom: number) => Math.round(Math.min(2900, Math.max(700, 0.75 * chesscom + 650)))

export const fromHuman = (lichess: number) => Math.round((lichess - 650) / 0.75 / 10) * 10

export const moveAccuracy = (loss: number) =>
  Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.04354 * loss * 100) - 3.1669))

export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export const harmonic = (xs: readonly number[]) =>
  xs.length ? xs.length / xs.reduce((a, x) => a + 1 / Math.max(x, 1), 0) : 0

const stdev = (xs: readonly number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)))
}

export const gameAccuracy = (whiteCurve: readonly number[], losses: readonly number[], parity: 0 | 1) => {
  const window = Math.min(8, Math.max(2, Math.floor(whiteCurve.length / 10)))
  const weights = whiteCurve.slice(1).map((_, i) => {
    const from = Math.max(0, i + 1 - window)
    return Math.min(12, Math.max(0.5, stdev(whiteCurve.slice(from, from + window).map(x => x * 100))))
  })
  const picked = losses.flatMap((loss, i) => (i % 2 === parity ? [{ acc: moveAccuracy(loss), w: weights[i] ?? 1 }] : []))
  if (!picked.length) return 0
  const weighted = picked.reduce((a, p) => a + p.acc * p.w, 0) / picked.reduce((a, p) => a + p.w, 0)
  return Math.round(((weighted + harmonic(picked.map(p => p.acc))) / 2) * 10) / 10
}
