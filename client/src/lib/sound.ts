import { settings } from './settings.svelte.ts'

interface Bus {
  ctx: AudioContext
  dry: GainNode
  wet: GainNode
  noise: AudioBuffer
}

let bus: Bus | null = null

const build = (): Bus => {
  const ctx = new AudioContext()
  const master = ctx.createDynamicsCompressor()
  master.threshold.value = -18
  master.ratio.value = 3
  master.connect(ctx.destination)
  const dry = ctx.createGain()
  dry.gain.value = 0.9
  dry.connect(master)
  const room = ctx.createConvolver()
  const tail = ctx.createBuffer(2, ctx.sampleRate * 0.35, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = tail.getChannelData(c)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 4
  }
  room.buffer = tail
  const wet = ctx.createGain()
  wet.gain.value = 0.14
  wet.connect(room).connect(master)
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate)
  const n = noise.getChannelData(0)
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1
  return { ctx, dry, wet, noise }
}

const out = (b: Bus, node: AudioNode) => {
  node.connect(b.dry)
  node.connect(b.wet)
}

const envelope = (g: GainNode, at: number, peak: number, attack: number, decay: number) => {
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
}

const knock = (b: Bus, at: number, freq: number, q: number, peak: number, decay: number) => {
  const src = b.ctx.createBufferSource()
  const filter = b.ctx.createBiquadFilter()
  const g = b.ctx.createGain()
  src.buffer = b.noise
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = q
  envelope(g, at, peak, 0.002, decay)
  src.connect(filter).connect(g)
  out(b, g)
  src.start(at, Math.random() * 0.1, decay + 0.05)
}

const tone = (b: Bus, at: number, freq: number, peak: number, decay: number, type: OscillatorType = 'sine', glide = 1) => {
  const osc = b.ctx.createOscillator()
  const g = b.ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * glide, at + decay)
  envelope(g, at, peak, 0.004, decay)
  osc.connect(g)
  out(b, g)
  osc.start(at)
  osc.stop(at + decay + 0.05)
}

const mallet = (b: Bus, at: number, freq: number, peak: number) => {
  tone(b, at, freq, peak, 0.42)
  tone(b, at, freq * 4.01, peak * 0.18, 0.09)
  tone(b, at, freq * 2.76, peak * 0.1, 0.14)
}

const clack = (b: Bus, at: number, weight: number) => {
  const pitch = 1 + (Math.random() - 0.5) * 0.12
  knock(b, at, 2300 * pitch, 1.4, 0.5 * weight, 0.03)
  knock(b, at, 900 * pitch, 2.2, 0.35 * weight, 0.06 + weight * 0.02)
  tone(b, at, 170 * pitch, 0.12 * weight, 0.07, 'sine', 0.55)
}

const play = (fn: (b: Bus, at: number) => void) => () => {
  if (!settings.sound) return
  try {
    bus ??= build()
    if (bus.ctx.state === 'suspended') void bus.ctx.resume()
    fn(bus, bus.ctx.currentTime + 0.005)
  } catch {}
}

export const sfx = {
  move: play((b, at) => clack(b, at, 1)),
  capture: play((b, at) => {
    clack(b, at, 1.35)
    knock(b, at + 0.022, 1500, 2, 0.32, 0.05)
    tone(b, at, 120, 0.12, 0.12, 'sine', 0.6)
  }),
  castle: play((b, at) => {
    clack(b, at, 0.9)
    clack(b, at + 0.11, 0.85)
  }),
  check: play((b, at) => {
    clack(b, at, 1)
    mallet(b, at + 0.03, 1046.5, 0.05)
  }),
  good: play((b, at) => {
    mallet(b, at, 659.3, 0.09)
    mallet(b, at + 0.09, 987.8, 0.08)
  }),
  great: play((b, at) => {
    mallet(b, at, 523.3, 0.08)
    mallet(b, at + 0.08, 659.3, 0.08)
    mallet(b, at + 0.16, 784, 0.08)
    mallet(b, at + 0.24, 1046.5, 0.09)
  }),
  bad: play((b, at) => {
    tone(b, at, 196, 0.12, 0.22, 'triangle', 0.8)
    tone(b, at + 0.1, 155.6, 0.1, 0.3, 'triangle', 0.85)
  }),
  tick: play((b, at) => knock(b, at, 3200, 3, 0.18, 0.02)),
}
