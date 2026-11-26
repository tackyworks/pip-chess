<script lang="ts">
  import type { Moment } from '../../../shared/types.ts'

  interface Props {
    points: (number | null)[]
    current: number
    moments?: Moment[]
    orientation?: 'white' | 'black'
    onseek?: (ply: number) => void
  }

  let { points, current, moments = [], orientation = 'white', onseek }: Props = $props()

  let width = $state(600)
  const H = 80
  let hover = $state<number | null>(null)
  let dragging = false

  const n = $derived(Math.max(1, points.length - 1))
  const x = (i: number) => (i / n) * width
  const y = (w: number) => (orientation === 'white' ? 1 - w : w) * (H - 8) + 4

  const known = $derived(points.map((w, i) => (w === null ? null : ([x(i), y(w)] as const))).filter((p): p is readonly [number, number] => p !== null))

  const curve = $derived.by(() => {
    if (known.length < 2) return ''
    let d = `M${known[0][0]},${known[0][1]}`
    for (let i = 1; i < known.length; i++) {
      const [px, py] = known[i - 1]
      const [cx, cy] = known[i]
      const mx = (px + cx) / 2
      d += ` C${mx},${py} ${mx},${cy} ${cx},${cy}`
    }
    return d
  })

  const area = $derived(known.length < 2 ? '' : `${curve} L${known.at(-1)![0]},${orientation === 'white' ? H : 0} L${known[0][0]},${orientation === 'white' ? H : 0} Z`)
  const complete = $derived(points.every(p => p !== null))

  const TONE = { good: 'var(--c-great)', bad: 'var(--c-blunder)', turn: 'var(--gold)' }

  const plyAt = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * n)
  }
</script>

<div class="graph" bind:clientWidth={width}>
  <svg
    width={width}
    height={H}
    role="slider"
    tabindex="-1"
    aria-valuenow={current}
    onpointerdown={e => {
      dragging = true
      ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
      onseek?.(plyAt(e))
    }}
    onpointermove={e => {
      hover = plyAt(e)
      if (dragging) onseek?.(hover)
    }}
    onpointerup={() => (dragging = false)}
    onpointerleave={() => (hover = null)}
  >
    <defs>
      <linearGradient id="graph-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f7f3ea" />
        <stop offset="1" stop-color="#d9d1c3" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" {width} height={H} rx="12" fill="#050505" />
    {#if area}<path d={area} fill="url(#graph-fill)" class:reveal={complete} />{/if}
    <line x1="0" x2={width} y1={H / 2} y2={H / 2} stroke="#6f6b64" stroke-opacity="0.6" stroke-dasharray="4 5" />
    {#if !complete}
      {#each known as [px, py]}
        <circle cx={px} cy={py} r="2" fill="var(--accent)" class="tick" />
      {/each}
    {/if}
    {#if hover !== null}
      <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--text)" stroke-opacity="0.25" />
    {/if}
    <line class="cursor" x1={x(current)} x2={x(current)} y1="0" y2={H} stroke="var(--accent)" stroke-width="3" stroke-linecap="round" />
    {#each moments as m, i}
      {#if points[m.ply] != null}
        <circle class="moment" style="animation-delay: {0.35 + i * 0.08}s" cx={x(m.ply)} cy={y(points[m.ply]!)} r={m.ply === current ? 7 : 5.5} fill={TONE[m.tone]} stroke="#050505" stroke-width="2.5" />
      {/if}
    {/each}
  </svg>
</div>

<style>
  .graph {
    width: 100%;
    user-select: none;
    touch-action: none;
  }
  svg {
    display: block;
    cursor: pointer;
    border-radius: 12px;
  }
  .reveal {
    animation: reveal 0.9s var(--ease);
  }
  .cursor {
    transition: x1 0.18s var(--ease), x2 0.18s var(--ease);
  }
  .moment {
    transform-box: fill-box;
    transform-origin: center;
    animation: pop 0.45s var(--spring) both;
    transition: r 0.2s var(--spring);
  }
  .tick {
    animation: fade 0.4s ease both;
  }
  @keyframes reveal {
    from {
      clip-path: inset(0 100% 0 0);
    }
    to {
      clip-path: inset(0 0 0 0);
    }
  }
  @keyframes pop {
    from {
      transform: scale(0);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
