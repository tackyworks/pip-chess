<script lang="ts">
  import { fly } from 'svelte/transition'
  import Pip from '../components/Pip.svelte'
  import Count from '../components/Count.svelte'
  import Icon from '../components/Icon.svelte'
  import Sponsor from '../components/Sponsor.svelte'
  import { api } from '../lib/api.ts'
  import { app, siteName } from '../lib/state.svelte.ts'
  import { href } from '../lib/router.svelte.ts'
  import { MOTIFS } from '../../../shared/themes.ts'
  import type { HabitStat, Insights } from '../../../shared/types.ts'

  let data = $state<Insights | null>(null)
  let tc = $state<string | null>(null)
  let openHabit = $state<string | null>(null)

  $effect(() => {
    void app.me?.analyzed
    const pick = tc
    void api.insights(pick ?? undefined).then(d => (data = d))
  })

  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null)

  const skills = $derived.by(() => {
    if (!data) return []
    const tactical = data.motifs.filter(m => m.chances >= 2)
    const chances = tactical.reduce((a, m) => a + m.chances, 0)
    const missed = tactical.reduce((a, m) => a + m.missed, 0)
    const phase = (i: number) => (data!.phases[i]?.moves ? data!.phases[i].accuracy : null)
    return [
      { name: 'Opening', value: phase(0) },
      { name: 'Middlegame', value: phase(1) },
      { name: 'Endgame', value: phase(2) },
      { name: 'Tactics', value: chances >= 5 ? pct(chances - missed, chances) : null },
      { name: 'Converting', value: data.conversion.chances >= 3 ? pct(data.conversion.converted, data.conversion.chances) : null },
      { name: 'Clock', value: data.time.pressureMoves >= 10 ? 100 - pct(data.time.pressureErrors, data.time.pressureMoves)! : null },
    ]
  })

  const R = 92
  const C = 130
  const point = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 6
    return [C + Math.cos(a) * R * v, C + Math.sin(a) * R * v] as const
  }
  const ring = (v: number) => Array.from({ length: 6 }, (_, i) => point(i, v).join(',')).join(' ')
  const shape = $derived(skills.map((s, i) => point(i, Math.max(0.12, (s.value ?? 0) / 100)).join(',')).join(' '))

  const spark = $derived.by(() => {
    const values = (data?.trend ?? []).map(t => t.perf).filter((p): p is number => p !== null)
    if (values.length < 3) return null
    const smooth = values.map((_, i) => {
      const w = values.slice(Math.max(0, i - 4), i + 1)
      return w.reduce((a, b) => a + b, 0) / w.length
    })
    const lo = Math.min(...smooth) - 40
    const hi = Math.max(...smooth) + 40
    const W = 280
    const H = 70
    const pts = smooth.map((v, i) => [(i / (smooth.length - 1)) * W, H - 6 - ((v - lo) / (hi - lo)) * (H - 12)] as const)
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length
    const delta = values.length >= 10 ? Math.round(mean(values.slice(-5)) - mean(values.slice(-10, -5))) : 0
    return { d, area: `${d} L${W},${H} L0,${H} Z`, end: pts.at(-1)!, W, H, delta }
  })

  const leak = $derived(data?.focus[0] ?? null)
  const more = $derived(data?.focus.slice(1) ?? [])

  const stats = $derived.by(() => {
    if (!data) return []
    const out: { value: number | null; unit: string; label: string; good: boolean | null }[] = [
      { value: pct(data.conversion.converted, data.conversion.chances), unit: '%', label: 'winning positions won', good: null },
      { value: pct(data.resilience.saved, data.resilience.chances), unit: '%', label: 'lost positions saved', good: null },
    ]
    if (data.time.pressureMoves >= 10) out.push({ value: pct(data.time.pressureErrors, data.time.pressureMoves), unit: '%', label: 'errors when low on time', good: null })
    if (data.tilt.afterLoss !== null) out.push({ value: data.tilt.afterLoss, unit: '%', label: 'score right after a loss', good: data.tilt.afterWin !== null ? data.tilt.afterLoss >= data.tilt.afterWin - 5 : null })
    return out
  })

  const motifs = $derived(
    (data?.motifs ?? []).map(m => {
      const tactical = m.chances >= 2
      return {
        ...m,
        tactical,
        level: tactical ? Math.min(2, m.ratio) / 2 : Math.min(1, m.allowed / Math.max(1, data!.analyzed)),
        tone: tactical ? (m.ratio > 1.15 ? 'bad' : m.ratio < 0.85 ? 'good' : 'even') : m.allowed ? 'bad' : 'even',
      }
    }),
  )

  const toggle = (h: HabitStat) => (openHabit = openHabit === h.key ? null : h.key)
</script>

{#if !data}
  <div class="empty"><Pip mood="think" size={80} /></div>
{:else if data.analyzed < 3}
  <div class="empty">
    <Pip mood="sleep" size={110} />
    <h2>Not enough games yet</h2>
    <p class="soft">I need at least 3 analyzed games to see patterns. {data.analyzed} so far.</p>
    <button class="btn primary" onclick={() => api.analyzeMore(20)}>Analyze 20 games</button>
  </div>
{:else}
  <div class="page">
    {#if data.classes.length > 1}
      <div class="filters">
        {#each [null, ...data.classes] as c}
          <button class="filter" class:on={tc === c} onclick={() => (tc = c)}>{c ?? 'all'}</button>
        {/each}
      </div>
    {/if}

    <section class="top">
      <div class="level card">
        <span class="label">Playing strength</span>
        <div class="big num">{#if data.perf}<Count value={data.perf} />{:else}–{/if}</div>
        {#if spark}
          <svg class="spark" viewBox="0 0 {spark.W} {spark.H}" preserveAspectRatio="none">
            <defs>
              <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stop-color="#f2b544" stop-opacity="0.28" />
                <stop offset="1" stop-color="#f2b544" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path d={spark.area} fill="url(#spark-fill)" />
            <path d={spark.d} class="spark-line" pathLength="1" />
            <circle cx={spark.end[0]} cy={spark.end[1]} r="5" class="spark-end" />
          </svg>
        {/if}
        <div class="chips">
          {#if spark && spark.delta}<span class="chip trend" class:down={spark.delta < 0}>{spark.delta > 0 ? '+' : ''}{spark.delta} over your last 5 games</span>{/if}
          {#if data.accuracy}<span class="chip">{data.accuracy}% accuracy</span>{/if}
          {#if data.rating}<span class="chip">{siteName()} {data.rating}</span>{/if}
          <span class="chip">{data.analyzed} games</span>
        </div>
      </div>

      <div class="radar card">
        <span class="label">Your game</span>
        <svg viewBox="0 0 260 260" class="radar-svg">
          {#each [1, 0.66, 0.33] as v}<polygon points={ring(v)} class="grid" />{/each}
          {#each skills as _, i}<line x1={C} y1={C} x2={point(i, 1)[0]} y2={point(i, 1)[1]} class="spoke" />{/each}
          <polygon points={shape} class="area" />
          {#each skills as s, i}
            {@const [x, y] = point(i, 1.27)}
            <text {x} y={y - 3} class="axis" text-anchor="middle">{s.name}</text>
            <text {x} y={y + 14} class="axis-value" class:none={s.value === null} text-anchor="middle">{s.value ?? '–'}</text>
          {/each}
        </svg>
      </div>
    </section>

    {#if leak}
      <section class="leak card" in:fly={{ y: 12, duration: 360 }}>
        <div class="leak-icon"><Icon name={leak.key} size={34} /></div>
        <div class="leak-body">
          <span class="label">Biggest leak right now</span>
          <h2>{leak.title}</h2>
          <p class="soft">{leak.why}</p>
          <p class="fix"><Icon name="bulb" size={18} />{leak.fix}</p>
        </div>
        <a class="btn primary" href={href(`/train?theme=${leak.theme}`)}>Train it</a>
      </section>
      {#if more.length}
        <div class="more">
          {#each more as f, i}
            <a class="more-card card" href={href(`/train?theme=${f.theme}`)} in:fly={{ y: 10, delay: 80 + i * 70, duration: 320 }}>
              <span class="more-icon"><Icon name={f.key} size={22} /></span>
              <span class="more-title">{f.title}</span>
              <span class="go">Train</span>
            </a>
          {/each}
        </div>
      {/if}
    {/if}

    {#if data.habits.length}
      <section>
        <h2 class="label">Habits</h2>
        <div class="habits">
          {#each data.habits as h}
            <button class="habit card" class:bad={h.verdict === 'bad'} class:open={openHabit === h.key} onclick={() => toggle(h)}>
              <span class="habit-icon"><Icon name={h.key} size={22} /></span>
              <span class="habit-text">
                <b>{h.title}</b>
                <span>{h.value}</span>
                {#if openHabit === h.key}<span class="advice" in:fly={{ y: -4, duration: 200 }}>{h.advice}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if stats.length}
      <section class="stats">
        {#each stats as s}
          <div class="stat card">
            <span class="stat-value num">{s.value ?? '–'}<small>{s.value === null ? '' : s.unit}</small></span>
            <span class="soft">{s.label}</span>
          </div>
        {/each}
      </section>
    {/if}

    {#if motifs.length}
      <section>
        <div class="section-head">
          <h2 class="label">Tactics and themes</h2>
          <span class="key"><i></i> typical at your level</span>
        </div>
        <div class="motifs">
          {#each motifs as m}
            <a class="motif card {m.tone}" href={href(`/train?theme=${MOTIFS[m.motif].puzzle}`)}>
              <span class="motif-icon"><Icon name={m.motif} size={22} /></span>
              <span class="motif-body">
                <b>{MOTIFS[m.motif].name}</b>
                <span class="meter">
                  {#if m.tactical}<span class="typical"></span>{/if}
                  <span class="fill" style="width: {Math.max(4, m.level * 100)}%"></span>
                </span>
                <span class="tiny soft num">{m.tactical ? `missed ${m.missed} of ${m.chances}` : `cost you ${m.allowed}×`}</span>
              </span>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <Sponsor placement="insights" />

    {#if data.openings.length}
      <section>
        <h2 class="label">Openings</h2>
        <div class="openings">
          {#each data.openings as o}
            <div class="opening card">
              <span class="side {o.color}"></span>
              <span class="opening-main">
                <b>{o.name}</b>
                <span class="tiny soft">{o.games} games · {o.accuracy}% accuracy{o.firstError ? ` · slips around move ${o.firstError}` : ''}</span>
              </span>
              <span class="score">
                <span class="score-bar"><span style="width: {o.score}%" class:low={o.score < 45}></span></span>
                <span class="num">{o.score}%</span>
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  .page {
    width: min(1040px, 100%);
    margin: 0 auto;
    padding: 30px 24px 90px;
    display: flex;
    flex-direction: column;
    gap: 26px;
  }
  .empty {
    min-height: 60vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    text-align: center;
  }
  .empty h2 {
    margin: 6px 0 0;
  }
  .soft {
    color: var(--dim);
    margin: 0;
  }
  .tiny {
    font-size: 13px;
  }
  section > .label,
  .section-head .label {
    margin: 0 0 12px;
  }
  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: -6px;
  }
  .filter {
    padding: 7px 16px;
    border-radius: 12px;
    border: 2px solid var(--line);
    font-size: 14px;
    font-weight: 800;
    color: var(--dim);
    text-transform: capitalize;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .filter:hover {
    color: var(--text);
  }
  .filter.on {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .top {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .level {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .big {
    font-size: 72px;
    font-weight: 600;
    line-height: 1;
    color: var(--accent);
  }
  .spark {
    width: 100%;
    height: 70px;
    margin: 10px 0 6px;
  }
  .spark-line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 1.2s var(--ease) forwards;
    vector-effect: non-scaling-stroke;
  }
  .spark-end {
    fill: var(--accent);
    stroke: var(--panel);
    stroke-width: 3;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
  }
  .chips .chip {
    color: var(--dim);
  }
  .chip.trend {
    color: var(--c-best);
    background: color-mix(in srgb, var(--c-best) 14%, transparent);
  }
  .chip.trend.down {
    color: var(--red);
    background: color-mix(in srgb, var(--red) 14%, transparent);
  }

  .radar {
    padding: 20px 20px 10px;
    display: flex;
    flex-direction: column;
  }
  .radar-svg {
    width: 100%;
    max-width: 330px;
    margin: -4px auto 0;
    overflow: visible;
  }
  .grid {
    fill: none;
    stroke: var(--line);
    stroke-width: 1.5;
  }
  .spoke {
    stroke: var(--line);
    stroke-width: 1.5;
  }
  .area {
    fill: color-mix(in srgb, var(--accent) 22%, transparent);
    stroke: var(--accent);
    stroke-width: 3;
    stroke-linejoin: round;
    transform-origin: 130px 130px;
    animation: grow 0.7s var(--spring);
  }
  @keyframes grow {
    from {
      transform: scale(0.3);
      opacity: 0;
    }
  }
  .axis {
    font: 800 11.5px var(--font);
    fill: var(--dim);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .axis-value {
    font: 600 16px var(--display);
    fill: var(--text);
  }
  .axis-value.none {
    fill: var(--faint);
  }

  .leak {
    display: flex;
    align-items: center;
    gap: 22px;
    padding: 24px 26px;
    border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
    background: linear-gradient(120deg, color-mix(in srgb, var(--accent) 9%, var(--panel)), var(--panel) 60%);
  }
  .leak-icon {
    width: 72px;
    height: 72px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 22px;
    color: var(--accent-ink);
    background: var(--accent);
    box-shadow: inset 0 -5px 0 var(--accent-d);
  }
  .leak-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .leak h2 {
    margin: 0;
    font-size: 28px;
  }
  .fix {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: 4px 0 0;
    font-size: 15px;
    color: var(--text);
  }
  .fix :global(svg) {
    color: var(--accent);
    margin-top: 1px;
  }
  .leak .btn {
    flex: none;
    height: 52px;
    padding: 0 26px;
  }
  .more {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-top: -12px;
  }
  .more-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s, transform 0.2s var(--spring);
  }
  .more-card:hover {
    border-color: var(--line-2);
    transform: translateY(-2px);
  }
  .more-icon {
    color: var(--accent);
  }
  .more-title {
    flex: 1;
    font-weight: 800;
  }
  .go {
    font-size: 13px;
    font-weight: 900;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .habits {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 12px;
  }
  .habit {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 16px;
    text-align: left;
    border-left: 6px solid var(--c-best);
    transition: border-color 0.15s;
  }
  .habit.bad {
    border-left-color: var(--orange);
  }
  .habit-icon {
    width: 42px;
    height: 42px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 13px;
    color: var(--c-best);
    background: color-mix(in srgb, var(--c-best) 14%, transparent);
  }
  .habit.bad .habit-icon {
    color: var(--orange);
    background: color-mix(in srgb, var(--orange) 14%, transparent);
  }
  .habit-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .habit-text b {
    font-size: 16px;
  }
  .habit-text span {
    color: var(--dim);
    font-size: 14px;
  }
  .habit-text .advice {
    margin-top: 6px;
    color: var(--text);
    line-height: 1.45;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 12px;
  }
  .stat {
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-value {
    font: 600 40px/1.1 var(--display);
  }
  .stat-value small {
    font-size: 22px;
    color: var(--dim);
    margin-left: 2px;
  }
  .stat .soft {
    font-size: 14px;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--faint);
    font-weight: 700;
  }
  .key i {
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: var(--text);
  }
  .motifs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }
  .motif {
    --tone: var(--c-good);
    display: flex;
    gap: 12px;
    padding: 14px;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s, transform 0.2s var(--spring);
  }
  .motif.bad {
    --tone: var(--orange);
  }
  .motif.good {
    --tone: var(--c-best);
  }
  .motif:hover {
    border-color: var(--line-2);
    transform: translateY(-2px);
  }
  .motif-icon {
    width: 40px;
    height: 40px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: var(--tone);
    background: color-mix(in srgb, var(--tone) 14%, transparent);
  }
  .motif-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .motif-body b {
    font-size: 15px;
  }
  .meter {
    position: relative;
    height: 8px;
    border-radius: 8px;
    background: var(--line);
  }
  .meter .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 8px;
    background: var(--tone);
  }
  .meter .typical {
    position: absolute;
    left: 50%;
    top: -3px;
    bottom: -3px;
    width: 3px;
    border-radius: 2px;
    background: var(--text);
    z-index: 1;
  }

  .openings {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .opening {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
  }
  .side {
    width: 16px;
    height: 16px;
    flex: none;
    border-radius: 5px;
    border: 2px solid var(--line-2);
  }
  .side.white {
    background: var(--ivory);
  }
  .side.black {
    background: #202022;
  }
  .opening-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .opening-main b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .score {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 900;
  }
  .score-bar {
    width: 120px;
    height: 10px;
    border-radius: 10px;
    background: var(--line);
    overflow: hidden;
  }
  .score-bar span {
    display: block;
    height: 100%;
    border-radius: 10px;
    background: var(--c-best);
  }
  .score-bar span.low {
    background: var(--orange);
  }

  @media (max-width: 760px) {
    .top {
      grid-template-columns: 1fr;
    }
    .leak {
      flex-direction: column;
      align-items: flex-start;
    }
    .leak .btn {
      width: 100%;
    }
    .score-bar {
      width: 70px;
    }
  }
</style>
