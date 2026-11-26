<script module lang="ts">
  import type { Mood } from '../../../shared/types.ts'

  type Eyes = 'open' | 'wide' | 'happy' | 'closed' | 'half'

  interface Face {
    eyes: Eyes
    mouth: string
    brows?: [string, string]
    blush?: boolean
    tongue?: boolean
  }

  const NO_BROWS: [string, string] = ['M30.5 21.6 Q34 21.6 37.5 21.6', 'M42.5 21.6 Q46 21.6 49.5 21.6']
  const SAD_BROWS: [string, string] = ['M30.5 22.6 Q34 21.8 37.2 20.2', 'M42.8 20.2 Q46 21.8 49.5 22.6']
  const UP_BROWS: [string, string] = ['M30.5 20.6 Q34 17.8 37.5 20', 'M42.5 20 Q46 17.8 49.5 20.6']
  const HMM_BROWS: [string, string] = ['M30.5 21.8 Q34 21.8 37.5 21.8', 'M42.5 20.6 Q46 18.2 49.5 20']

  const FACES: Record<Mood, Face> = {
    idle: { eyes: 'open', mouth: 'M34.5 37 C36.5 39.6 43.5 39.6 45.5 37 C43.5 39.6 36.5 39.6 34.5 37 Z' },
    ok: { eyes: 'open', mouth: 'M35.5 37.6 C37.5 39.2 42.5 39.2 44.5 37.6 C42.5 39.2 37.5 39.2 35.5 37.6 Z' },
    happy: { eyes: 'happy', mouth: 'M33.5 36.4 C36 40.8 44 40.8 46.5 36.4 C44 41 36 41 33.5 36.4 Z', blush: true },
    proud: { eyes: 'happy', mouth: 'M34 37.4 C37 40 43.6 39.6 46.6 35.8 C43.6 39.8 37 40.2 34 37.4 Z', blush: true },
    star: { eyes: 'wide', mouth: 'M33 35.8 C35 36.5 45 36.5 47 35.8 C46.2 43.8 33.8 43.8 33 35.8 Z', brows: UP_BROWS, blush: true, tongue: true },
    cheer: { eyes: 'happy', mouth: 'M33 35.8 C35 36.5 45 36.5 47 35.8 C46.2 43.8 33.8 43.8 33 35.8 Z', blush: true, tongue: true },
    read: { eyes: 'half', mouth: 'M36 37.8 C38 39 42 39 44 37.8 C42 39 38 39 36 37.8 Z' },
    think: { eyes: 'open', mouth: 'M37 38.8 C38.6 38.3 41.4 38.3 43 38.9 C41.4 38.3 38.6 38.3 37 38.8 Z', brows: HMM_BROWS },
    hmm: { eyes: 'open', mouth: 'M35 38.8 C37 38.5 43 37.8 45 37.5 C43 37.8 37 38.5 35 38.8 Z', brows: HMM_BROWS },
    worried: { eyes: 'open', mouth: 'M34.5 39 C37 36.6 42 40.8 45.5 38.2 C42 40.8 37 36.6 34.5 39 Z', brows: SAD_BROWS },
    shock: { eyes: 'wide', mouth: 'M37.2 39 C37.2 35 42.8 35 42.8 39 C42.8 43 37.2 43 37.2 39 Z', brows: UP_BROWS },
    sad: { eyes: 'open', mouth: 'M35 40 C37 37.2 43 37.2 45 40 C43 37.2 37 37.2 35 40 Z', brows: SAD_BROWS },
    oops: { eyes: 'closed', mouth: 'M35 40 C37 37.4 43 37.4 45 40 C43 37.4 37 37.4 35 40 Z', brows: SAD_BROWS },
    sleep: { eyes: 'closed', mouth: 'M37.5 38.2 C38.8 39.2 41.2 39.2 42.5 38.2 C41.2 39.2 38.8 39.2 37.5 38.2 Z' },
  }

  const POSE: Record<Mood, { la: number; ra: number; tilt: number; drop: number }> = {
    idle: { la: 16, ra: -16, tilt: 0, drop: 0 },
    ok: { la: 18, ra: -18, tilt: 3, drop: 0 },
    happy: { la: 60, ra: -60, tilt: -3, drop: 0 },
    proud: { la: 42, ra: -42, tilt: -6, drop: -0.5 },
    star: { la: 150, ra: -150, tilt: 0, drop: -0.5 },
    cheer: { la: 150, ra: -150, tilt: 0, drop: -0.5 },
    read: { la: -32, ra: 32, tilt: 6, drop: 1 },
    think: { la: 16, ra: 143, tilt: -5, drop: 0 },
    hmm: { la: 16, ra: 143, tilt: -9, drop: 0 },
    worried: { la: -22, ra: 22, tilt: 4, drop: 0.5 },
    shock: { la: 122, ra: -122, tilt: 0, drop: -1 },
    sad: { la: 4, ra: -4, tilt: 7, drop: 2.2 },
    oops: { la: -158, ra: 158, tilt: 3, drop: 1 },
    sleep: { la: 6, ra: -6, tilt: 10, drop: 1.5 },
  }

  type Keyframes = Keyframe[]
  const JUMP: Keyframes = [
    { transform: 'none' },
    { transform: 'scale(1.08, 0.9)', offset: 0.18 },
    { transform: 'translateY(-13px) scale(0.94, 1.07)', offset: 0.45 },
    { transform: 'translateY(0) scale(1.07, 0.92)', offset: 0.72 },
    { transform: 'none' },
  ]
  const REACT: Partial<Record<Mood, { body?: Keyframes; head?: Keyframes; duration: number }>> = {
    happy: { body: JUMP.map(k => ({ ...k, transform: String(k.transform).replace('-13px', '-6px') })), head: [{ transform: 'none' }, { transform: 'translateY(1.5px)', offset: 0.3 }, { transform: 'translateY(-1px)', offset: 0.6 }, { transform: 'none' }], duration: 560 },
    cheer: { body: JUMP, head: [{ transform: 'none' }, { transform: 'translateY(2px)', offset: 0.3 }, { transform: 'translateY(-2px) rotate(-4deg)', offset: 0.62 }, { transform: 'none' }], duration: 720 },
    star: { body: JUMP, head: [{ transform: 'none' }, { transform: 'translateY(2px)', offset: 0.3 }, { transform: 'translateY(-2px) rotate(4deg)', offset: 0.62 }, { transform: 'none' }], duration: 720 },
    proud: { head: [{ transform: 'none' }, { transform: 'rotate(-7deg)', offset: 0.35 }, { transform: 'rotate(4deg)', offset: 0.7 }, { transform: 'none' }], duration: 620 },
    shock: {
      body: [{ transform: 'none' }, { transform: 'translateY(2px) scale(1.07, 0.9)', offset: 0.15 }, { transform: 'translateY(-5px) scale(0.93, 1.08)', offset: 0.42 }, { transform: 'translateX(-1.5px)', offset: 0.62 }, { transform: 'translateX(1px)', offset: 0.78 }, { transform: 'none' }],
      head: [{ transform: 'none' }, { transform: 'translateY(2px)', offset: 0.2 }, { transform: 'translateY(-3px) rotate(-5deg)', offset: 0.5 }, { transform: 'rotate(3deg)', offset: 0.75 }, { transform: 'none' }],
      duration: 640,
    },
    worried: { body: [{ transform: 'none' }, { transform: 'scale(1.03, 0.96)', offset: 0.3 }, { transform: 'translateX(-0.8px)', offset: 0.55 }, { transform: 'translateX(0.8px)', offset: 0.75 }, { transform: 'none' }], duration: 520 },
    oops: { body: [{ transform: 'none' }, { transform: 'scale(1.06, 0.92)', offset: 0.25 }, { transform: 'translateX(-1.2px)', offset: 0.5 }, { transform: 'translateX(1.2px)', offset: 0.7 }, { transform: 'none' }], duration: 480 },
    sad: { body: [{ transform: 'none' }, { transform: 'scale(1.02, 0.95)', offset: 0.5 }, { transform: 'none' }], duration: 900 },
    hmm: { head: [{ transform: 'none' }, { transform: 'rotate(-6deg)', offset: 0.5 }, { transform: 'none' }], duration: 700 },
    ok: { head: [{ transform: 'none' }, { transform: 'translateY(1.2px) rotate(2deg)', offset: 0.4 }, { transform: 'none' }], duration: 420 },
  }
</script>

<script lang="ts">
  interface Props {
    mood?: Mood
    size?: number
    follow?: boolean
  }

  let { mood = 'idle', size = 64, follow = false }: Props = $props()

  const uid = $props.id()
  const face = $derived(FACES[mood])
  const pose = $derived(POSE[mood])
  const brows = $derived(face.brows ?? NO_BROWS)
  const eyeRy = $derived(face.eyes === 'wide' ? 4 : face.eyes === 'half' ? 1.7 : 3.3)
  const eyeRx = $derived(face.eyes === 'wide' ? 3.1 : 2.7)

  let root: SVGSVGElement
  let body: SVGGElement
  let head: SVGGElement
  let lids: SVGGElement

  $effect(() => {
    const react = REACT[mood]
    if (!react || !body) return
    const options = { duration: react.duration, easing: 'cubic-bezier(.3,.7,.3,1)' }
    if (react.body) body.animate(react.body, options)
    if (react.head) head.animate(react.head, { ...options, delay: 50 })
  })

  $effect(() => {
    let timer: ReturnType<typeof setTimeout>
    const blink = () => {
      timer = setTimeout(() => {
        if (face.eyes === 'open' || face.eyes === 'wide') lids?.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.08)' }, { transform: 'scaleY(1)' }], { duration: 150, easing: 'ease-in-out' })
        blink()
      }, 2400 + Math.random() * 3200)
    }
    blink()
    return () => clearTimeout(timer)
  })

  $effect(() => {
    if (!follow) return
    let frame = 0
    let x = 0
    let y = 0
    const apply = () => {
      frame = 0
      const r = root.getBoundingClientRect()
      const dx = x - (r.left + r.width / 2)
      const dy = y - (r.top + r.height * 0.32)
      const d = Math.hypot(dx, dy) || 1
      const k = Math.min(1, d / 260)
      root.style.setProperty('--px', ((dx / d) * 1.8 * k).toFixed(2))
      root.style.setProperty('--py', ((dy / d) * 1.4 * k).toFixed(2))
    }
    const track = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      if (!frame) frame = requestAnimationFrame(apply)
    }
    addEventListener('pointermove', track, { passive: true })
    return () => {
      removeEventListener('pointermove', track)
      cancelAnimationFrame(frame)
    }
  })
</script>

<svg
  bind:this={root}
  class="pip"
  data-mood={mood}
  viewBox="0 0 80 92"
  width={size}
  height={size * 1.15}
  aria-hidden="true"
  style="--la: {pose.la}deg; --ra: {pose.ra}deg; --tilt: {pose.tilt}deg; --drop: {pose.drop}px"
>
  <defs>
    <clipPath id="{uid}-head"><circle cx="40" cy="29" r="17" /></clipPath>
    <clipPath id="{uid}-torso"><path d="M30.5 48 C30.5 59 22.5 63 21 73 L59 73 C57.5 63 49.5 59 49.5 48 Z" /></clipPath>
  </defs>

  <ellipse class="shadow" cx="40" cy="87.5" rx="19" ry="2.8" />

  <g bind:this={body} class="react-body">
    <g class="breathe">
      <rect x="16.5" y="71" width="47" height="14" rx="7" class="shade" />
      <rect x="16.5" y="71" width="47" height="10.5" rx="5.25" class="skin" />
      <path d="M30.5 48 C30.5 59 22.5 63 21 73 L59 73 C57.5 63 49.5 59 49.5 48 Z" class="shade" />
      <g clip-path="url(#{uid}-torso)"><path d="M27 48 C27 59 19 63 17.5 73 L55.5 73 C54 63 46 59 46 48 Z" class="skin" /></g>

      <g class="scarf">
        <rect x="25" y="43.5" width="30" height="9" rx="4.5" class="scarf-d" />
        <rect x="25" y="43.5" width="30" height="7" rx="3.5" class="scarf-c" />
        <g class="tail"><path d="M48 49 l5.5 9.5 l-4.6 1.4 l-4.2 -9.5 z" class="scarf-d" /></g>
      </g>

      <g class="arm arm-l">
        <g class="swing">
          <rect x="-3.2" y="-1" width="6.4" height="14" rx="3.2" class="limb" />
          <circle cx="0" cy="13" r="3.6" class="limb" />
        </g>
      </g>
      <g class="arm arm-r">
        <g class="swing">
          <rect x="-3.2" y="-1" width="6.4" height="14" rx="3.2" class="limb" />
          <circle cx="0" cy="13" r="3.6" class="limb" />
        </g>
      </g>

      <g class="head-pose">
        <g bind:this={head} class="react-head">
          <g class="bob">
            <circle cx="40" cy="29" r="17" class="shade" />
            <g clip-path="url(#{uid}-head)"><circle cx="37" cy="26.6" r="17" class="skin" /></g>

            <g class="cheeks" class:on={face.blush}>
              <ellipse cx="29.5" cy="35.2" rx="3" ry="1.8" />
              <ellipse cx="50.5" cy="35.2" rx="3" ry="1.8" />
            </g>

            <g class="brows" class:on={!!face.brows}>
              <path style:d={`path("${brows[0]}")`} />
              <path style:d={`path("${brows[1]}")`} />
            </g>

            <g class="look">
              <g class="eyes" class:hidden={face.eyes === 'happy' || face.eyes === 'closed'}>
                <g bind:this={lids} class="lids">
                  <ellipse cx="34" cy="28.6" class="pupil" style:rx={eyeRx} style:ry={eyeRy} />
                  <ellipse cx="46" cy="28.6" class="pupil" style:rx={eyeRx} style:ry={eyeRy} />
                </g>
                <circle cx="35" cy="27" r="1" class="glint" />
                <circle cx="47" cy="27" r="1" class="glint" />
              </g>
            </g>
            <g class="arcs" class:on={face.eyes === 'happy'}>
              <path d="M31.2 29.8 Q34 25.6 36.8 29.8" />
              <path d="M43.2 29.8 Q46 25.6 48.8 29.8" />
            </g>
            <g class="arcs" class:on={face.eyes === 'closed'}>
              <path d="M31.2 28.4 Q34 31 36.8 28.4" />
              <path d="M43.2 28.4 Q46 31 48.8 28.4" />
            </g>

            <path class="mouth" style:d={`path("${face.mouth}")`} />
            <path class="tongue" class:on={face.tongue} d="M37.4 41.2 Q40 43.6 42.6 41.2 Q40 39.8 37.4 41.2 Z" />
          </g>
        </g>
      </g>

      {#if mood === 'read'}
        <g class="book">
          <path d="M29 62 l11 2.4 l11 -2.4 v10 l-11 2.4 l-11 -2.4 z" fill="var(--purple)" />
          <path d="M40 64.4 v10" stroke="var(--purple-d)" stroke-width="1.2" />
        </g>
      {/if}
    </g>
  </g>

  {#if mood === 'worried' || mood === 'oops'}
    <path class="sweat" d="M57 13 q-2.6 4.2 0 6 q2.6 -1.8 0 -6 z" />
  {:else if mood === 'sleep'}
    <text class="zz" x="56" y="12">z</text>
  {:else if mood === 'star' || mood === 'cheer'}
    <g class="confetti">
      <rect x="10" y="12" width="4" height="7" rx="2" fill="var(--accent)" style="--r: -30deg; --dx: -6px" />
      <rect x="64" y="10" width="4" height="7" rx="2" fill="var(--gold)" style="--r: 35deg; --dx: 6px" />
      <rect x="20" y="2" width="4" height="6" rx="2" fill="var(--c-miss)" style="--r: -10deg; --dx: -3px" />
      <rect x="56" y="1" width="4" height="6" rx="2" fill="var(--accent)" style="--r: 15deg; --dx: 3px" />
    </g>
  {/if}
</svg>

<style>
  .pip {
    --px: 0;
    --py: 0;
    display: block;
    flex: none;
    overflow: visible;
  }
  .skin,
  .limb {
    fill: #f8f5ee;
  }
  .limb {
    fill: #ebe6dc;
  }
  .shade {
    fill: #d6cebf;
  }
  .scarf-c {
    fill: var(--accent);
  }
  .scarf-d {
    fill: var(--accent-d);
  }
  .shadow {
    fill: #000;
    opacity: 0.25;
  }
  .react-body,
  .breathe {
    transform-box: view-box;
    transform-origin: 40px 86px;
  }
  .breathe {
    animation: breathe 3.6s ease-in-out infinite;
  }
  .arm {
    transition: transform 0.5s var(--spring);
  }
  .arm-l {
    transform: translate(27.5px, 55px) rotate(var(--la));
  }
  .arm-r {
    transform: translate(52.5px, 55px) rotate(var(--ra));
  }
  .swing {
    transform-box: view-box;
    transform-origin: 0 0;
  }
  [data-mood='cheer'] .arm-l .swing,
  [data-mood='star'] .arm-l .swing {
    animation: wave 0.8s ease-in-out 0.5s infinite alternate;
  }
  [data-mood='cheer'] .arm-r .swing,
  [data-mood='star'] .arm-r .swing {
    animation: wave 0.8s ease-in-out 0.9s infinite alternate-reverse;
  }
  [data-mood='happy'] .arm-l .swing {
    animation: wave 0.5s ease-in-out 0.3s 2 alternate;
  }
  .head-pose {
    transform-box: view-box;
    transform-origin: 40px 45px;
    transform: translateY(var(--drop)) rotate(var(--tilt));
    transition: transform 0.55s var(--spring);
  }
  .react-head,
  .bob {
    transform-box: view-box;
    transform-origin: 40px 45px;
  }
  .bob {
    animation: bob 3.6s ease-in-out 0.25s infinite;
  }
  .tail {
    transform-box: view-box;
    transform-origin: 48px 49px;
    animation: sway 3.6s ease-in-out 0.4s infinite;
  }
  .look {
    transform: translate(calc(var(--px) * 1px), calc(var(--py) * 1px));
    transition: transform 0.15s linear;
  }
  [data-mood='think'] .look {
    animation: scan 4.2s ease-in-out infinite;
  }
  [data-mood='read'] .look,
  [data-mood='sad'] .look {
    transform: translateY(1.4px);
  }
  .eyes {
    transition: opacity 0.12s;
  }
  .eyes.hidden {
    opacity: 0;
  }
  .lids {
    transform-box: fill-box;
    transform-origin: center;
  }
  .pupil {
    fill: #1c1814;
    transition: rx 0.25s var(--spring), ry 0.25s var(--spring);
  }
  .glint {
    fill: #fff;
  }
  .arcs,
  .brows,
  .cheeks,
  .tongue {
    opacity: 0;
    transition: opacity 0.18s;
  }
  .arcs.on,
  .brows.on,
  .cheeks.on,
  .tongue.on {
    opacity: 1;
  }
  .arcs path,
  .brows path {
    fill: none;
    stroke: #1c1814;
    stroke-width: 2.3;
    stroke-linecap: round;
  }
  .brows path {
    stroke-width: 1.9;
    transition: d 0.3s var(--ease);
  }
  .cheeks ellipse {
    fill: #ff9db3;
    opacity: 0.7;
  }
  .mouth {
    fill: #1c1814;
    stroke: #1c1814;
    stroke-width: 1.9;
    stroke-linejoin: round;
    stroke-linecap: round;
    transition: d 0.28s var(--ease);
  }
  .tongue {
    fill: #ff7a8f;
  }
  .book {
    animation: rise 0.4s var(--spring) both;
    transform-box: fill-box;
    transform-origin: center bottom;
  }
  .sweat {
    fill: #9fd0f0;
    animation: drip 1.8s ease-in infinite;
  }
  .zz {
    font: 900 12px var(--font);
    fill: var(--dim);
    animation: float 2.6s ease-in-out infinite;
  }
  .confetti rect {
    transform-box: fill-box;
    transform-origin: center;
    animation: toss 0.9s var(--ease) both;
  }
  @keyframes breathe {
    50% {
      transform: scale(1.015, 0.985);
    }
  }
  @keyframes bob {
    50% {
      transform: translateY(0.8px);
    }
  }
  @keyframes sway {
    50% {
      transform: rotate(6deg);
    }
  }
  @keyframes wave {
    to {
      transform: rotate(-16deg);
    }
  }
  @keyframes scan {
    0%,
    100% {
      transform: translate(1.2px, -1.2px);
    }
    35% {
      transform: translate(-1.4px, -1.4px);
    }
    65% {
      transform: translate(1.6px, -0.6px);
    }
  }
  @keyframes rise {
    from {
      transform: translateY(6px) scale(0.6);
      opacity: 0;
    }
  }
  @keyframes drip {
    0% {
      opacity: 0;
      transform: translateY(-2px);
    }
    25% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(7px);
    }
  }
  @keyframes float {
    50% {
      transform: translate(2px, -3px);
    }
  }
  @keyframes toss {
    from {
      opacity: 0;
      transform: translate(0, 14px) rotate(0) scale(0.4);
    }
    60% {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: translate(var(--dx), -6px) rotate(var(--r)) scale(1);
    }
  }
</style>
