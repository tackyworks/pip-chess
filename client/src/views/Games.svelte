<script lang="ts">
  import { slide } from 'svelte/transition'
  import Pip from '../components/Pip.svelte'
  import Avatar from '../components/Avatar.svelte'
  import Sponsor from '../components/Sponsor.svelte'
  import MiniBoard from '../components/MiniBoard.svelte'
  import Icon from '../components/Icon.svelte'
  import { api } from '../lib/api.ts'
  import { app, siteName, working } from '../lib/state.svelte.ts'
  import { dayLabel, opponent, outcome } from '../lib/format.ts'
  import { go, href } from '../lib/router.svelte.ts'
  import type { GameDetail, GameRow, Mood } from '../../../shared/types.ts'

  let importing = $state(false)
  let pgn = $state('')
  let importError = $state<string | null>(null)
  let filter = $state('all')

  const shown = $derived(app.games.filter(g => filter === 'all' || g.timeClass === filter))
  const groups = $derived.by(() => {
    const out: { day: string; games: GameRow[] }[] = []
    for (const g of shown) {
      const day = dayLabel(g.endTime)
      if (out.at(-1)?.day !== day) out.push({ day, games: [] })
      out.at(-1)!.games.push(g)
    }
    return out
  })
  const classes = $derived([...new Set(app.games.map(g => g.timeClass))])
  const unanalyzed = $derived(app.games.filter(g => g.status === 'new' && g.you).length)
  const busy = $derived(working())
  const RESULT = { win: 'Won', loss: 'Lost', draw: 'Draw' }

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const week = $derived.by(() => {
    const since = Date.now() / 1000 - 7 * 86400
    const list = app.games.filter(g => g.you && g.endTime >= since && g.timeClass !== 'pip')
    const results = list.map(outcome)
    const scored = list.filter(g => g.accuracy !== null && g.status === 'done')
    return {
      games: list.length,
      wins: results.filter(r => r === 'win').length,
      losses: results.filter(r => r === 'loss').length,
      accuracy: scored.length ? scored.reduce((a, g) => a + g.accuracy!, 0) / scored.length : null,
    }
  })

  const latest = $derived(app.games.find(g => g.you && g.timeClass !== 'pip') ?? null)
  let preview = $state<GameDetail | null>(null)
  $effect(() => {
    const id = latest?.id
    if (!id) return
    void api.game(id).then(d => (preview = d)).catch(() => undefined)
  })
  const lastLoss = $derived(app.games.find(g => g.you && outcome(g) === 'loss' && g.timeClass !== 'pip') ?? null)

  const mood = $derived<Mood>(busy ? 'think' : !week.games ? 'happy' : week.wins > week.losses ? 'proud' : week.wins < week.losses ? 'ok' : 'happy')
  const line = $derived(
    busy
      ? `I’m reviewing ${busy} game${busy === 1 ? '' : 's'} for you right now.`
      : week.games
        ? `${week.games} game${week.games === 1 ? '' : 's'} this week, ${week.wins} win${week.wins === 1 ? '' : 's'}. Let’s keep it going.`
        : 'Play a few games and I’ll have something to say about them.',
  )

  const streak = $derived(app.me?.streak ?? null)
  const PLAN = $derived([
    lastLoss
      ? { icon: 'chances', title: `Learn from the loss vs ${opponent(lastLoss).name}`, href: `/game/${encodeURIComponent(lastLoss.id)}` }
      : { icon: 'chances', title: 'Review your latest game', href: latest ? `/game/${encodeURIComponent(latest.id)}` : '/' },
    { icon: 'fork', title: 'Solve a round of puzzles', href: '/train' },
    { icon: 'development', title: 'Drill your opening repertoire', href: '/openings' },
  ])

  const submitPgn = async () => {
    importError = null
    try {
      const { id } = await api.importPgn(pgn)
      app.wanted.add(id)
      importing = false
      pgn = ''
      go(`/game/${encodeURIComponent(id)}`)
    } catch (e) {
      importError = (e as Error).message
    }
  }
</script>

<div class="page">
  <header>
    <Pip {mood} size={78} follow />
    <div class="who">
      <h1>{greeting}, {app.me?.username}!</h1>
      <p class="dim">
        {line}
        {#if app.me?.rating}<span class="rating-chip">{app.me.rating} on {siteName()}</span>{/if}
      </p>
    </div>
    <div class="tools">
      <button class="btn ghost" onclick={() => (importing = !importing)}>Paste PGN</button>
      <button class="btn" onclick={() => api.sync().then(() => (app.syncing = true))} disabled={app.syncing}>
        <svg viewBox="0 0 20 20" width="18" height="18"><path d="M15.5 8.5A5.8 5.8 0 0 0 5 6.6M4.5 11.5A5.8 5.8 0 0 0 15 13.4M5 3.5v3.3h3.3M15 16.5v-3.3h-3.3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {app.syncing ? 'Syncing…' : 'Sync'}
      </button>
    </div>
  </header>

  {#if importing}
    <div class="import card" transition:slide={{ duration: 200 }}>
      <textarea bind:value={pgn} placeholder="Paste a PGN from any site" rows="5"></textarea>
      <div class="row">
        {#if importError}<span class="error">{importError}</span>{/if}
        <span class="grow"></span>
        <button class="btn ghost" onclick={() => (importing = false)}>Cancel</button>
        <button class="btn primary" onclick={submitPgn} disabled={!pgn.trim()}>Review</button>
      </div>
    </div>
  {/if}

  {#if app.syncError}<p class="error">{app.syncError}</p>{/if}

  {#if latest}
    <section class="dash">
      <a class="last card" href={href(`/game/${encodeURIComponent(latest.id)}`)}>
        {#if preview?.line.moves.length}
          {@const end = preview.line.moves.at(-1)!}
          <MiniBoard fen={end.fen} last={end.uci} orientation={latest.you ?? 'white'} size={124} />
        {:else}
          <span class="mini-ph"></span>
        {/if}
        <span class="last-body">
          <span class="label">Latest game</span>
          <b>vs {opponent(latest).name}</b>
          <span class="dim small">{latest.opening ?? latest.timeClass}</span>
          <span class="last-foot">
            {#if outcome(latest)}<span class="result {outcome(latest)}">{RESULT[outcome(latest)!]}</span>{/if}
            {#if latest.accuracy !== null}<span class="acc-small num">{latest.accuracy.toFixed(1)}<small>%</small></span>{/if}
          </span>
        </span>
      </a>

      <div class="plan card">
        <div class="plan-head">
          <span class="label">Today’s plan</span>
          {#if streak}<span class="plan-count num">{Math.min(streak.today, streak.goal)}/{streak.goal}</span>{/if}
        </div>
        {#each PLAN as step, i}
          <a class="step" href={href(step.href)}>
            <span class="step-icon" class:done={!!streak && streak.today > i}><Icon name={streak && streak.today > i ? 'conversion' : step.icon} size={20} /></span>
            <span class="step-title">{step.title}</span>
            <svg viewBox="0 0 20 20" width="18" height="18" class="chev"><path d="M7.5 4.5L13 10l-5.5 5.5" /></svg>
          </a>
        {/each}
      </div>
    </section>

    <section class="week">
      <div class="tile card"><span class="tile-value num">{week.games}</span><span class="dim small">games this week</span></div>
      <div class="tile card"><span class="tile-value num">{week.wins}<small>–{week.losses}</small></span><span class="dim small">wins – losses</span></div>
      <div class="tile card"><span class="tile-value num">{week.accuracy === null ? '–' : week.accuracy.toFixed(1)}{#if week.accuracy !== null}<small>%</small>{/if}</span><span class="dim small">average accuracy</span></div>
      <div class="tile card streak-tile"><span class="tile-value num">{streak?.days ?? 0}<small>&nbsp;day{streak?.days === 1 ? '' : 's'}</small></span><span class="dim small">streak · best {streak?.best ?? 0}</span></div>
    </section>
  {/if}

  {#if classes.length > 1}
    <div class="filters">
      {#each ['all', ...classes] as c}
        <button class="filter" class:on={filter === c} onclick={() => (filter = c)}>{c}</button>
      {/each}
    </div>
  {/if}

  {#if !app.games.length}
    <div class="empty">
      <Pip mood={app.syncing ? 'think' : 'sleep'} size={96} />
      <p class="dim">{app.syncing ? `Fetching your games from ${siteName()}…` : 'No games yet.'}</p>
    </div>
  {:else}
    {#each groups as group, gi (group.day)}
      <section class="day">
        <h2 class="label">{group.day}</h2>
        <div class="list">
          {#each group.games as game (game.id)}
            {@const result = outcome(game)}
            {@const rival = opponent(game)}
            {@const p = app.progress[game.id]}
            <a class="game" href={href(`/game/${encodeURIComponent(game.id)}`)}>
              <Avatar name={rival.name} size={44} mascot={game.timeClass === 'pip' && rival.name === 'Pip'} />
              <span class="who-col">
                <span class="name">{rival.name}<span class="faint num rating">{rival.rating || ''}</span></span>
                <span class="opening">{game.opening ?? 'Unknown opening'}</span>
              </span>
              <span class="meta"><span class="tc">{game.timeClass}</span> · {Math.ceil(game.moves / 2)} moves</span>
              <span class="result {result ?? 'none'}">{result ? RESULT[result] : game.result}</span>
              <span class="score">
                {#if game.accuracy !== null}
                  <span class="acc num" class:stale={game.status !== 'done'}>{game.accuracy.toFixed(1)}</span>
                  <span class="faint small">accuracy</span>
                {:else if game.status === 'analyzing'}
                  <span class="bar"><span style="width: {p && p.total ? Math.max(6, (p.done / p.total) * 100) : 6}%"></span></span>
                  <span class="faint small">analyzing</span>
                {:else if game.status === 'queued'}
                  <span class="faint small">queued</span>
                {:else if game.status === 'error'}
                  <span class="error small">failed</span>
                {:else}
                  <span class="faint small">not analyzed</span>
                {/if}
              </span>
            </a>
          {/each}
        </div>
      </section>
      {#if gi === 0}<div class="slot"><Sponsor placement="games" /></div>{/if}
    {/each}
    {#if unanalyzed}
      <div class="more">
        <button class="btn ivory" onclick={() => api.analyzeMore(20)}>Analyze 20 more</button>
        <span class="dim">{unanalyzed} games not analyzed yet</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    width: min(980px, 100%);
    margin: 0 auto;
    padding: 34px 24px 90px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 26px;
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  h1 {
    font-size: 32px;
    margin: 0;
    line-height: 1.1;
  }
  header p {
    margin: 4px 0 0;
    font-size: 15px;
  }
  .rating-chip {
    display: inline-flex;
    margin-left: 8px;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 800;
    color: var(--dim);
    background: var(--panel-2);
  }
  .dash {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 14px;
    margin-bottom: 14px;
  }
  .last {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 16px;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s, transform 0.2s var(--spring);
  }
  .last:hover,
  .step:hover {
    border-color: var(--line-2);
  }
  .last:hover {
    transform: translateY(-2px);
  }
  .mini-ph {
    width: 124px;
    height: 124px;
    flex: none;
    border-radius: 12px;
    background: var(--panel-2);
  }
  .last-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .last-body b {
    font: 600 22px var(--display);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .last-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }
  .acc-small {
    font: 600 22px var(--display);
  }
  .acc-small small {
    font-size: 14px;
    color: var(--dim);
  }
  .small {
    font-size: 14px;
  }
  .plan {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .plan-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .plan-count {
    font-weight: 900;
    color: var(--orange);
  }
  .step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 8px;
    margin: 0 -8px;
    border-radius: 12px;
    border: 2px solid transparent;
    color: inherit;
    text-decoration: none;
    font-weight: 800;
    font-size: 15px;
    transition: background 0.15s;
  }
  .step:hover {
    background: var(--panel-2);
  }
  .step-icon {
    width: 36px;
    height: 36px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 13%, transparent);
  }
  .step-icon.done {
    color: var(--accent-ink);
    background: var(--accent);
  }
  .step-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chev {
    fill: none;
    stroke: var(--faint);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .week {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 30px;
  }
  .tile {
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tile-value {
    font: 600 32px/1.15 var(--display);
  }
  .tile-value small {
    font-size: 17px;
    color: var(--dim);
  }
  .streak-tile .tile-value {
    color: var(--orange);
  }
  @media (max-width: 860px) {
    .dash {
      grid-template-columns: 1fr;
    }
    .week {
      grid-template-columns: 1fr 1fr;
    }
  }
  .tools {
    display: flex;
    gap: 10px;
  }
  .import {
    padding: 16px;
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  textarea {
    background: var(--bg);
    border: 2px solid var(--line);
    border-radius: 14px;
    padding: 12px 14px;
    resize: vertical;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    outline: 0;
  }
  textarea:focus {
    border-color: var(--accent);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .grow {
    flex: 1;
  }
  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
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
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .slot:not(:empty) {
    margin-top: 26px;
  }
  .day {
    content-visibility: auto;
    contain-intrinsic-size: auto 400px;
  }
  h2 {
    margin: 26px 0 10px 4px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .game {
    display: grid;
    grid-template-columns: 44px minmax(0, 1.7fr) auto 70px 96px;
    align-items: center;
    gap: 16px;
    padding: 12px 18px 12px 14px;
    border-radius: 16px;
    border: 2px solid var(--line);
    border-bottom-width: 4px;
    background: var(--panel);
    color: inherit;
    text-decoration: none;
    transition: transform 0.08s ease, background 0.15s, border-color 0.15s;
  }
  .game:hover {
    background: var(--panel-2);
    border-color: var(--line-2);
  }
  .game:active {
    transform: translateY(2px);
    border-bottom-width: 2px;
    margin-bottom: 2px;
  }
  .who-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-weight: 800;
    font-size: 16.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rating {
    margin-left: 8px;
    font-size: 14px;
  }
  .opening {
    font-size: 14px;
    color: var(--dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: 14px;
    color: var(--faint);
    white-space: nowrap;
  }
  .tc {
    text-transform: capitalize;
  }
  .result {
    justify-self: center;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 10px;
    border-radius: 10px;
    color: var(--dim);
    background: var(--panel-2);
  }
  .result.win {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .result.loss {
    color: var(--red);
    background: color-mix(in srgb, var(--red) 14%, transparent);
  }
  .score {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .acc {
    font-size: 22px;
    font-weight: 900;
    line-height: 1;
  }
  .stale {
    opacity: 0.45;
  }
  .small {
    font-size: 12.5px;
  }
  .bar {
    width: 80px;
    height: 10px;
    border-radius: 10px;
    background: var(--line);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: 10px;
    background: var(--accent);
    transition: width 0.4s var(--ease);
  }
  .error {
    color: var(--red);
    font-size: 14px;
  }
  .empty {
    display: grid;
    place-items: center;
    gap: 14px;
    padding: 90px 0;
  }
  .more {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 30px 0 0;
  }
  .filters {
    overflow-x: auto;
    scrollbar-width: none;
  }
  @media (max-width: 820px) {
    .game {
      grid-template-columns: 44px 1fr 70px 80px;
    }
    .meta {
      display: none;
    }
  }
  @media (max-width: 560px) {
    .page {
      padding: 22px 14px 40px;
    }
    header {
      flex-wrap: wrap;
    }
    .who {
      flex: 1 1 0;
    }
    h1 {
      font-size: 26px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .queue {
      display: block;
    }
    .tools {
      width: 100%;
    }
    .tools > :global(*) {
      flex: 1;
    }
    .game {
      grid-template-columns: 40px 1fr auto;
      gap: 12px;
      padding: 10px 12px;
    }
    .result {
      display: none;
    }
  }
</style>
