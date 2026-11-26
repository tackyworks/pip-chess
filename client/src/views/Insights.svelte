<script lang="ts">
  import { slide } from 'svelte/transition'
  import Pip from '../components/Pip.svelte'
  import Count from '../components/Count.svelte'
  import Sponsor from '../components/Sponsor.svelte'
  import { api } from '../lib/api.ts'
  import { app, siteName } from '../lib/state.svelte.ts'
  import { href } from '../lib/router.svelte.ts'
  import { MOTIFS } from '../../../shared/themes.ts'
  import type { Insights } from '../../../shared/types.ts'

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
      { name: 'Spotting tactics', value: chances >= 5 ? pct(chances - missed, chances) : null },
      { name: 'Converting wins', value: data.conversion.chances >= 3 ? pct(data.conversion.converted, data.conversion.chances) : null },
      { name: 'Under time pressure', value: data.time.pressureMoves >= 10 ? 100 - pct(data.time.pressureErrors, data.time.pressureMoves)! : null },
    ]
  })
  const weakest = $derived(
    skills.filter(s => s.value !== null).reduce<{ name: string; value: number | null } | null>((low, s) => (!low || s.value! < low.value! ? s : low), null)?.name ?? null,
  )

  const spark = $derived.by(() => {
    const values = (data?.trend ?? []).map(t => t.perf).filter((p): p is number => p !== null)
    if (values.length < 3) return null
    const smooth = values.map((_, i) => {
      const w = values.slice(Math.max(0, i - 4), i + 1)
      return w.reduce((a, b) => a + b, 0) / w.length
    })
    const lo = Math.min(...smooth) - 40
    const hi = Math.max(...smooth) + 40
    const W = 400
    const H = 80
    const pts = smooth.map((v, i) => [(i / (smooth.length - 1)) * W, H - 6 - ((v - lo) / (hi - lo)) * (H - 12)] as const)
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length
    const delta = values.length >= 10 ? Math.round(mean(values.slice(-5)) - mean(values.slice(-10, -5))) : 0
    return { d, area: `${d} L${W},${H} L0,${H} Z`, W, H, delta }
  })

  const leak = $derived(data?.focus[0] ?? null)
  const more = $derived(data?.focus.slice(1) ?? [])

  const facts = $derived.by(() => {
    if (!data) return []
    const out: { value: string; label: string }[] = []
    const won = pct(data.conversion.converted, data.conversion.chances)
    const saved = pct(data.resilience.saved, data.resilience.chances)
    if (won !== null) out.push({ value: `${won}%`, label: 'of winning positions won' })
    if (saved !== null) out.push({ value: `${saved}%`, label: 'of lost positions saved' })
    if (data.tilt.afterLoss !== null) out.push({ value: `${data.tilt.afterLoss}%`, label: 'score in the game after a loss' })
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
</script>

{#if !data}
  <div class="empty"><Pip mood="think" size={72} /></div>
{:else if data.analyzed < 3}
  <div class="empty">
    <Pip mood="sleep" size={96} />
    <h2>Not enough games yet</h2>
    <p>Insights need at least 3 reviewed games. You have {data.analyzed}.</p>
    <button class="btn primary" onclick={() => api.analyzeMore(20)}>Review 20 games</button>
  </div>
{:else}
  <div class="page">
    <header>
      <h1>Insights</h1>
      {#if data.classes.length > 1}
        <nav class="filters" aria-label="Time control">
          {#each [null, ...data.classes] as c}
            <button class:on={tc === c} onclick={() => (tc = c)}>{c ?? 'All games'}</button>
          {/each}
        </nav>
      {/if}
    </header>

    <section class="top">
      <div class="level">
        <span class="label">Playing strength</span>
        <div class="big num">{#if data.perf}<Count value={data.perf} />{:else}–{/if}</div>
        <p class="sub">
          {#if spark?.delta}<span class="trend" class:down={spark.delta < 0}>{spark.delta > 0 ? '+' : ''}{spark.delta}</span> over your last 5 games ·{/if}
          {data.analyzed} games reviewed{#if data.rating} · {data.rating} on {siteName()}{/if}
        </p>
        {#if spark}
          <svg class="spark" viewBox="0 0 {spark.W} {spark.H}" preserveAspectRatio="none" aria-hidden="true">
            <path d={spark.area} class="spark-area" />
            <path d={spark.d} class="spark-line" />
          </svg>
        {/if}
      </div>

      <div class="skills">
        {#each skills as s}
          <div class="skill" class:weak={s.name === weakest}>
            <span class="skill-name">{s.name}</span>
            <span class="skill-bar"><span style="width: {s.value ?? 0}%"></span></span>
            <span class="skill-value num">{s.value ?? '–'}</span>
          </div>
        {/each}
      </div>
    </section>

    {#if leak}
      <section class="leak">
        <span class="label">Work on this first</span>
        <h2>{leak.title}</h2>
        <p>{leak.why} {leak.fix}</p>
        <div class="leak-actions">
          <a class="btn primary" href={href(`/train?theme=${leak.theme}`)}>Practice this</a>
          {#if more.length}
            <span class="also">
              Then:
              {#each more as f, i}{#if i}, {/if}<a href={href(`/train?theme=${f.theme}`)}>{f.title.toLowerCase()}</a>{/each}
            </span>
          {/if}
        </div>
      </section>
    {/if}

    {#if data.habits.length}
      <section>
        <h3>Habits</h3>
        <div class="rows">
          {#each data.habits as h}
            <button class="habit" onclick={() => (openHabit = openHabit === h.key ? null : h.key)} aria-expanded={openHabit === h.key}>
              <span class="dot" class:bad={h.verdict === 'bad'}></span>
              <span class="habit-title">{h.title}</span>
              <span class="habit-value">{h.value}</span>
              {#if openHabit === h.key}<span class="advice" transition:slide={{ duration: 180 }}>{h.advice}</span>{/if}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if facts.length}
      <p class="facts">
        {#each facts as f, i}{#if i}<span class="sep"></span>{/if}<span><b class="num">{f.value}</b> {f.label}</span>{/each}
      </p>
    {/if}

    {#if motifs.length}
      <section>
        <div class="section-head">
          <h3>Tactics and themes</h3>
          <span class="key"><i></i>typical player at your rating</span>
        </div>
        <div class="rows">
          {#each motifs as m}
            <a class="motif {m.tone}" href={href(`/train?theme=${MOTIFS[m.motif].puzzle}`)}>
              <span class="motif-name">{MOTIFS[m.motif].name}</span>
              <span class="meter">
                {#if m.tactical}<span class="typical"></span>{/if}
                <span class="fill" style="width: {Math.max(3, m.level * 100)}%"></span>
              </span>
              <span class="motif-count num">{m.tactical ? `missed ${m.missed} of ${m.chances}` : `cost you ${m.allowed}×`}</span>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <Sponsor placement="insights" />

    {#if data.openings.length}
      <section>
        <h3>Openings</h3>
        <div class="rows">
          {#each data.openings as o}
            <div class="opening">
              <span class="side {o.color}" title="as {o.color}"></span>
              <span class="opening-main">
                <span class="opening-name">{o.name}</span>
                <span class="opening-sub">{o.games} games · {o.accuracy}% accuracy{o.firstError ? ` · usually slips around move ${o.firstError}` : ''}</span>
              </span>
              <span class="score num" class:low={o.score < 45}>{o.score}%</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  .page {
    width: min(900px, 100%);
    margin: 0 auto;
    padding: 36px 24px 90px;
    display: flex;
    flex-direction: column;
    gap: 40px;
  }
  .empty {
    min-height: 60vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    text-align: center;
    color: var(--dim);
  }
  .empty h2 {
    margin: 8px 0 0;
    color: var(--text);
  }
  .empty p {
    margin: 0 0 8px;
  }
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: -16px;
  }
  h1 {
    margin: 0;
    font-size: 34px;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 20px;
  }
  .filters {
    display: flex;
    gap: 4px;
  }
  .filters button {
    padding: 6px 12px;
    border-radius: 9px;
    font-size: 14px;
    font-weight: 800;
    color: var(--faint);
    text-transform: capitalize;
  }
  .filters button:hover {
    color: var(--text);
  }
  .filters button.on {
    color: var(--text);
    background: var(--panel-2);
  }

  .top {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 48px;
    align-items: start;
  }
  .level {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .big {
    font-size: 76px;
    font-weight: 600;
    line-height: 1;
    color: var(--text);
  }
  .sub {
    margin: 6px 0 0;
    color: var(--faint);
    font-weight: 700;
    font-size: 14.5px;
  }
  .trend {
    color: var(--c-best);
  }
  .trend.down {
    color: var(--red);
  }
  .spark {
    width: 100%;
    height: 80px;
    margin-top: 14px;
  }
  .spark-area {
    fill: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .spark-line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .skills {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 8px;
  }
  .skill {
    display: grid;
    grid-template-columns: 160px 1fr 34px;
    align-items: center;
    gap: 14px;
  }
  .skill-name {
    font-weight: 700;
    color: var(--dim);
  }
  .skill-bar {
    height: 8px;
    border-radius: 8px;
    background: var(--panel-2);
    overflow: hidden;
  }
  .skill-bar span {
    display: block;
    height: 100%;
    border-radius: 8px;
    background: var(--ivory-d);
    transition: width 0.6s var(--ease);
  }
  .skill.weak .skill-name {
    color: var(--text);
  }
  .skill.weak .skill-bar span {
    background: var(--orange);
  }
  .skill-value {
    font-weight: 800;
    text-align: right;
  }

  .leak {
    padding: 26px 28px;
    border-radius: 18px;
    background: var(--panel);
    border: 1px solid var(--line);
  }
  .leak h2 {
    margin: 4px 0 8px;
    font-size: 28px;
  }
  .leak p {
    margin: 0;
    max-width: 640px;
    color: var(--dim);
    font-size: 16.5px;
    line-height: 1.6;
  }
  .leak-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
    margin-top: 18px;
  }
  .also {
    color: var(--faint);
    font-weight: 700;
  }
  .also a {
    color: var(--dim);
  }
  .also a:hover {
    color: var(--text);
  }

  .rows {
    display: flex;
    flex-direction: column;
  }
  .habit {
    display: grid;
    grid-template-columns: 10px auto 1fr;
    align-items: baseline;
    column-gap: 14px;
    padding: 14px 0;
    text-align: left;
    border-bottom: 1px solid var(--line);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--c-best);
    align-self: center;
  }
  .dot.bad {
    background: var(--orange);
  }
  .habit-title {
    font-weight: 800;
  }
  .habit-value {
    color: var(--faint);
    font-weight: 700;
    text-align: right;
  }
  .habit:hover .habit-title {
    color: var(--accent);
  }
  .advice {
    grid-column: 2 / -1;
    margin-top: 8px;
    color: var(--dim);
    line-height: 1.55;
    font-weight: 600;
  }

  .facts {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 22px;
    color: var(--dim);
    font-weight: 700;
  }
  .facts b {
    font: 600 24px var(--display);
    color: var(--text);
    margin-right: 4px;
  }
  .sep {
    width: 1px;
    height: 22px;
    background: var(--line-2);
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    color: var(--faint);
    font-weight: 700;
  }
  .key i {
    width: 2px;
    height: 14px;
    background: var(--text);
  }
  .motif {
    --tone: var(--ivory-d);
    display: grid;
    grid-template-columns: 210px 1fr 130px;
    align-items: center;
    gap: 18px;
    padding: 12px 0;
    color: inherit;
    text-decoration: none;
    border-bottom: 1px solid var(--line);
  }
  .motif.bad {
    --tone: var(--orange);
  }
  .motif.good {
    --tone: var(--c-best);
  }
  .motif-name {
    font-weight: 800;
  }
  .motif:hover .motif-name {
    color: var(--accent);
  }
  .meter {
    position: relative;
    height: 6px;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .meter .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 6px;
    background: var(--tone);
  }
  .meter .typical {
    position: absolute;
    left: 50%;
    top: -5px;
    bottom: -5px;
    width: 2px;
    background: var(--text);
    z-index: 1;
  }
  .motif-count {
    text-align: right;
    color: var(--faint);
    font-weight: 700;
    font-size: 14px;
  }

  .opening {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 13px 0;
    border-bottom: 1px solid var(--line);
  }
  .side {
    width: 12px;
    height: 12px;
    flex: none;
    border-radius: 3px;
    border: 1px solid var(--line-2);
  }
  .side.white {
    background: var(--ivory);
  }
  .side.black {
    background: #000;
  }
  .opening-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .opening-name {
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .opening-sub {
    color: var(--faint);
    font-size: 14px;
    font-weight: 600;
  }
  .score {
    font: 600 20px var(--display);
    color: var(--c-best);
  }
  .score.low {
    color: var(--orange);
  }

  @media (max-width: 760px) {
    .top {
      grid-template-columns: 1fr;
      gap: 28px;
    }
    .skill {
      grid-template-columns: 130px 1fr 30px;
    }
    .motif {
      grid-template-columns: 1fr 110px;
    }
    .meter {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .habit {
      grid-template-columns: 10px 1fr;
    }
    .habit-value {
      grid-column: 2;
      text-align: left;
    }
  }
</style>
