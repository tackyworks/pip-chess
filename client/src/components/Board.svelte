<script module lang="ts">
  export interface Arrow {
    uci: string
    brush: 'best' | 'threat' | 'line' | 'mine'
  }

  type Point = { x: number; y: number }

  const COLORS: Record<Arrow['brush'], string> = {
    best: '#4f9a3a',
    threat: '#d8463c',
    line: '#e39a2d',
    mine: '#9a6fd6',
  }

  const HEAD = 0.34
  const WIDTH = 0.19
  const INSET = 0.16

  const toward = (a: Point, b: Point, distance: number): Point => {
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    return { x: a.x + ((b.x - a.x) / len) * distance, y: a.y + ((b.y - a.y) / len) * distance }
  }

  const geometry = (uci: string, flip: boolean) => {
    const at = (sq: string): Point => {
      const file = sq.charCodeAt(0) - 97
      const rank = +sq[1] - 1
      return { x: (flip ? 7 - file : file) + 0.5, y: (flip ? rank : 7 - rank) + 0.5 }
    }
    const from = at(uci.slice(0, 2))
    const to = at(uci.slice(2, 4))
    const df = Math.abs(to.x - from.x)
    const dr = Math.abs(to.y - from.y)
    const knight = (df === 1 && dr === 2) || (df === 2 && dr === 1)
    const points = knight ? [from, dr === 2 ? { x: from.x, y: to.y } : { x: to.x, y: from.y }, to] : [from, to]
    const prev = points[points.length - 2]
    const base = toward(to, prev, HEAD)
    const ux = (to.x - base.x) / HEAD
    const uy = (to.y - base.y) / HEAD
    const shaft = [toward(from, points[1], INSET), ...points.slice(1, -1), toward(base, to, 0.04)]
    const d = shaft.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ')
    const nx = -uy * HEAD * 0.66
    const ny = ux * HEAD * 0.66
    const head = `M${to.x} ${to.y} L${base.x + nx} ${base.y + ny} L${base.x - nx} ${base.y - ny} Z`
    return { d, head }
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import { Chessground } from 'chessground'
  import type { Api } from 'chessground/api'
  import type { Config } from 'chessground/config'
  import type { Key } from 'chessground/types'
  import { destsOf, inCheck, squares, standardUci, turnOf } from '../lib/chess.ts'
  import { settings } from '../lib/settings.svelte.ts'
  import { sfx } from '../lib/sound.ts'
  import Glyph from './Glyph.svelte'
  import type { Label } from '../../../shared/types.ts'

  interface Props {
    fen: string
    orientation?: 'white' | 'black'
    last?: string | null
    movable?: 'white' | 'black' | 'turn' | null
    arrows?: Arrow[]
    badge?: { square: string; label: Label } | null
    hint?: string | null
    shake?: number
    onmove?: (uci: string) => void
  }

  let { fen, orientation = 'white', last = null, movable = null, arrows = [], badge = null, hint = null, shake = 0, onmove }: Props = $props()

  let el: HTMLDivElement
  let frame: HTMLDivElement
  let cg: Api | undefined
  let shownFen = ''
  let lastSound = 0
  let burst = $state<{ square: string; id: number } | null>(null)

  const pieces = (f: string) => f.split(' ')[0].replace(/[^a-zA-Z]/g, '').length
  const castled = (f: string, uci: string) => /^e[18][cg][18]$/.test(uci) && f.split(' ')[0].split('/')[uci[3] === '1' ? 7 : 0].includes(uci[3] === '1' ? 'K' : 'k')
  const at = (square: string) => {
    const file = square.charCodeAt(0) - 97
    const rank = +square[1] - 1
    return { x: orientation === 'white' ? file : 7 - file, y: orientation === 'white' ? 7 - rank : rank }
  }

  const config = (): Config => {
    const turn = turnOf(fen)
    const side = movable === 'turn' ? turn : movable
    return {
      fen,
      orientation,
      turnColor: turn,
      lastMove: last ? squares(last) : undefined,
      check: inCheck(fen) ? turn : false,
      coordinates: settings.coords,
      movable: { free: false, color: side ?? undefined, dests: side === turn ? destsOf(fen) : new Map(), showDests: true },
      highlight: { lastMove: true, check: true, custom: hint ? new Map([[hint as Key, 'hint']]) : undefined },
    }
  }

  onMount(() => {
    cg = Chessground(el, {
      ...config(),
      animation: { enabled: true, duration: 240 },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
      movable: {
        ...config().movable,
        events: { after: (orig, dest) => onmove?.(standardUci(fen, orig, dest)) },
      },
    })
    shownFen = fen
    return () => cg?.destroy()
  })

  $effect(() => {
    const next = config()
    if (!cg) return
    cg.set(next)
    if (fen !== shownFen && last) {
      const now = performance.now()
      const captured = pieces(fen) < pieces(shownFen)
      if (captured) burst = { square: last.slice(2, 4), id: now }
      if (now - lastSound > 70) {
        lastSound = now
        if (next.check) sfx.check()
        else if (captured) sfx.capture()
        else if (castled(fen, last)) sfx.castle()
        else sfx.move()
      }
    }
    shownFen = fen
  })

  $effect(() => {
    if (!shake || !frame) return
    frame.animate(
      [{ transform: 'none' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }],
      { duration: 360, easing: 'ease-out' },
    )
  })

  const drawn = $derived(arrows.map(a => ({ ...a, ...geometry(a.uci, orientation === 'black') })))

  const badgeAt = $derived.by(() => {
    if (!badge) return null
    const { x, y } = at(badge.square)
    return { left: `${(x + 1) * 12.5}%`, top: `${y * 12.5}%` }
  })

  const burstAt = $derived(burst ? at(burst.square) : null)
</script>

<div class="frame" bind:this={frame}>
  <div class="board" bind:this={el}></div>
  <svg class="arrows" viewBox="0 0 8 8" aria-hidden="true">
    {#each drawn as a (`${a.uci}${a.brush}${orientation}`)}
      <g class="arrow" style="--c: {COLORS[a.brush]}">
        <path class="shaft" d={a.d} pathLength="1" stroke-width={WIDTH} />
        <path class="head" d={a.head} />
      </g>
    {/each}
  </svg>
  {#if burst && burstAt}
    {#key burst.id}
      <div class="burst" style="left: {burstAt.x * 12.5}%; top: {burstAt.y * 12.5}%" onanimationend={() => (burst = null)}>
        <span class="ring"></span>
        {#each [0, 60, 120, 180, 240, 300] as angle}
          <span class="spark" style="--a: {angle}deg"></span>
        {/each}
      </div>
    {/key}
  {/if}
  {#if badge && badgeAt}
    {#key `${badge.square}${badge.label}${fen}`}
      <div class="badge" style="left: {badgeAt.left}; top: {badgeAt.top}">
        <Glyph label={badge.label} size={32} />
      </div>
    {/key}
  {/if}
</div>

<style>
  .frame {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
  }
  .board {
    width: 100%;
    height: 100%;
  }
  .arrows {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 3;
    pointer-events: none;
    overflow: visible;
  }
  .arrow {
    opacity: 0.8;
  }
  .burst {
    position: absolute;
    width: 12.5%;
    height: 12.5%;
    z-index: 4;
    pointer-events: none;
    display: grid;
    place-items: center;
  }
  .ring {
    position: absolute;
    width: 70%;
    height: 70%;
    border-radius: 50%;
    border: 3px solid rgb(255 244 220 / 0.9);
    animation: ring 0.42s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
  }
  .spark {
    position: absolute;
    width: 7%;
    height: 7%;
    border-radius: 50%;
    background: #fff3d6;
    transform: rotate(var(--a)) translateY(0);
    animation: spark 0.42s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
  }
  @keyframes ring {
    from {
      transform: scale(0.35);
      opacity: 1;
    }
    to {
      transform: scale(1.25);
      opacity: 0;
    }
  }
  @keyframes spark {
    from {
      transform: rotate(var(--a)) translateY(-10%);
      opacity: 1;
    }
    to {
      transform: rotate(var(--a)) translateY(-560%);
      opacity: 0;
    }
  }
  .shaft {
    fill: none;
    stroke: var(--c);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    animation: draw 0.32s var(--ease) both;
  }
  .head {
    fill: var(--c);
    stroke: var(--c);
    stroke-width: 0.06;
    stroke-linejoin: round;
    transform-box: fill-box;
    transform-origin: center;
    animation: tip 0.22s var(--spring) 0.2s both;
  }
  .badge {
    position: absolute;
    z-index: 5;
    transform: translate(-64%, -36%);
    pointer-events: none;
    filter: drop-shadow(0 3px 6px rgb(0 0 0 / 0.35));
    animation: badge 0.42s var(--spring) both;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes tip {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
  }
  @keyframes badge {
    from {
      opacity: 0;
      transform: translate(-64%, -36%) scale(0.3);
    }
  }
</style>
