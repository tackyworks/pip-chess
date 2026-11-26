<script lang="ts">
  import { slide } from 'svelte/transition'
  import Pip from '../components/Pip.svelte'
  import Avatar from '../components/Avatar.svelte'
  import Sponsor from '../components/Sponsor.svelte'
  import { api } from '../lib/api.ts'
  import { app, siteName, working } from '../lib/state.svelte.ts'
  import { dayLabel, opponent, outcome } from '../lib/format.ts'
  import { go, href } from '../lib/router.svelte.ts'
  import type { GameRow } from '../../../shared/types.ts'

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

  const nudge = $derived(app.games.find(g => g.you && g.timeClass !== 'pip' && outcome(g) === 'loss' && g.status === 'done') ?? null)

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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
    <div class="who">
      <h1>Games</h1>
      <p>
        {app.me?.username}{#if app.me?.rating} · {app.me.rating} on {siteName()}{/if}{#if busy} · <span class="busy">reviewing {busy}</span>{/if}
      </p>
    </div>
    <div class="tools">
      <button class="btn ghost" onclick={() => (importing = !importing)}>Paste PGN</button>
      <button class="btn" onclick={() => api.sync().then(() => (app.syncing = true))} disabled={app.syncing}>{app.syncing ? 'Syncing…' : 'Sync'}</button>
    </div>
  </header>

  {#if importing}
    <div class="import" transition:slide={{ duration: 200 }}>
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

  {#if week.games}
    <p class="summary">
      This week: <b>{plural(week.games, 'game')}</b>, <b>{week.wins}–{week.losses}</b>{#if week.accuracy !== null}, <b>{week.accuracy.toFixed(1)}%</b> average accuracy{/if}.
      {#if nudge}<a href={href(`/game/${encodeURIComponent(nudge.id)}`)}>Look at the loss to {opponent(nudge).name} →</a>{/if}
    </p>
  {/if}

  {#if classes.length > 1}
    <nav class="filters" aria-label="Time control">
      {#each ['all', ...classes] as c}
        <button class:on={filter === c} onclick={() => (filter = c)}>{c}</button>
      {/each}
    </nav>
  {/if}

  {#if !app.games.length}
    <div class="empty">
      <Pip mood={app.syncing ? 'think' : 'sleep'} size={84} />
      <p>{app.syncing ? `Fetching your games from ${siteName()}…` : 'No games yet. Play one and press Sync.'}</p>
    </div>
  {:else}
    {#each groups as group, gi (group.day)}
      <section class="day">
        <h2>{group.day}</h2>
        <div class="list">
          {#each group.games as game (game.id)}
            {@const result = outcome(game)}
            {@const rival = opponent(game)}
            {@const p = app.progress[game.id]}
            <a class="game" href={href(`/game/${encodeURIComponent(game.id)}`)}>
              <Avatar name={rival.name} size={34} mascot={game.timeClass === 'pip' && rival.name === 'Pip'} />
              <span class="who-col">
                <span class="name">{rival.name}<span class="rating num">{rival.rating || ''}</span></span>
                <span class="opening">{game.opening ?? 'Unknown opening'}</span>
              </span>
              <span class="meta"><span class="tc">{game.timeClass}</span> · {Math.ceil(game.moves / 2)} moves</span>
              <span class="result {result ?? 'none'}">{result ? RESULT[result] : game.result}</span>
              <span class="score">
                {#if game.accuracy !== null}
                  <span class="acc num" class:stale={game.status !== 'done'}>{game.accuracy.toFixed(1)}</span>
                {:else if game.status === 'analyzing'}
                  <span class="bar" title="Reviewing"><span style="width: {p && p.total ? Math.max(6, (p.done / p.total) * 100) : 6}%"></span></span>
                {:else if game.status === 'queued'}
                  <span class="state">Queued</span>
                {:else if game.status === 'error'}
                  <span class="state error">Failed</span>
                {:else}
                  <span class="state">–</span>
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
        <button class="btn" onclick={() => api.analyzeMore(20)}>Review 20 more</button>
        <span>{plural(unanalyzed, 'older game')} not reviewed yet</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    width: min(900px, 100%);
    margin: 0 auto;
    padding: 36px 24px 90px;
  }
  header {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    margin-bottom: 18px;
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 34px;
    line-height: 1.1;
  }
  header p {
    margin: 6px 0 0;
    color: var(--faint);
    font-weight: 700;
  }
  .busy {
    color: var(--accent);
  }
  .tools {
    display: flex;
    gap: 6px;
  }
  .summary {
    margin: 0 0 22px;
    color: var(--dim);
    line-height: 1.6;
  }
  .summary b {
    color: var(--text);
  }
  .summary a {
    margin-left: 6px;
    color: var(--accent);
    font-weight: 800;
    text-decoration: none;
    white-space: nowrap;
  }
  .summary a:hover {
    text-decoration: underline;
  }
  .import {
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  textarea {
    background: var(--panel);
    border: 1px solid var(--line-2);
    border-radius: 12px;
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
    gap: 8px;
  }
  .grow {
    flex: 1;
  }
  .filters {
    display: flex;
    gap: 4px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .filters button {
    position: relative;
    padding: 10px 12px;
    font-size: 15px;
    font-weight: 800;
    color: var(--faint);
    text-transform: capitalize;
    transition: color 0.15s;
  }
  .filters button:hover {
    color: var(--text);
  }
  .filters button.on {
    color: var(--text);
  }
  .filters button.on::after {
    content: '';
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: -1px;
    height: 2px;
    border-radius: 2px;
    background: var(--accent);
  }
  .slot:not(:empty) {
    margin-top: 22px;
  }
  .day {
    content-visibility: auto;
    contain-intrinsic-size: auto 400px;
  }
  h2 {
    margin: 26px 0 6px;
    font: 700 14px var(--font);
    color: var(--faint);
  }
  .list {
    display: flex;
    flex-direction: column;
  }
  .game {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto 64px 64px;
    align-items: center;
    gap: 16px;
    padding: 12px 12px;
    margin: 0 -12px;
    border-radius: 12px;
    color: inherit;
    text-decoration: none;
    transition: background 0.12s;
  }
  .game + .game {
    box-shadow: 0 -1px 0 var(--line);
  }
  .game:hover {
    background: var(--panel);
    box-shadow: none;
  }
  .game:hover + .game {
    box-shadow: none;
  }
  .who-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-weight: 800;
    font-size: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rating {
    margin-left: 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--faint);
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
    font-size: 14.5px;
    font-weight: 800;
    color: var(--faint);
  }
  .result.win {
    color: var(--c-best);
  }
  .result.loss {
    color: var(--red);
  }
  .score {
    display: flex;
    justify-content: flex-end;
  }
  .acc {
    font: 600 19px var(--display);
  }
  .stale {
    opacity: 0.45;
  }
  .state {
    font-size: 13.5px;
    color: var(--faint);
    font-weight: 700;
  }
  .bar {
    width: 56px;
    height: 6px;
    border-radius: 6px;
    background: var(--line);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
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
    gap: 12px;
    padding: 90px 0;
    color: var(--dim);
  }
  .more {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 28px;
    color: var(--faint);
    font-weight: 700;
  }
  @media (max-width: 760px) {
    .game {
      grid-template-columns: 34px minmax(0, 1fr) 54px 54px;
    }
    .meta {
      display: none;
    }
  }
  @media (max-width: 560px) {
    .page {
      padding: 22px 16px 40px;
    }
    header {
      flex-wrap: wrap;
      align-items: center;
    }
    .game {
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 12px;
    }
    .result {
      display: none;
    }
  }
</style>
