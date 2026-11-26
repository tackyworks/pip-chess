<script lang="ts">
  import { untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import Board, { type Arrow } from '../components/Board.svelte'
  import Pip from '../components/Pip.svelte'
  import { api } from '../lib/api.ts'
  import { app } from '../lib/state.svelte.ts'
  import { START, play } from '../lib/chess.ts'
  import { sfx } from '../lib/sound.ts'
  import { href } from '../lib/router.svelte.ts'
  import type { Color, DrillLine, Mood, RepNode, RepSummary, Repertoire } from '../../../shared/types.ts'

  let { color }: { color: Color } = $props()

  interface Step {
    uci: string
    san: string
    fen: string
    to: string
  }

  type Drill = {
    lines: DrillLine[]
    li: number
    si: number
    fen: string
    last: string | null
    status: 'auto' | 'yours' | 'wrong' | 'alt' | 'complete'
    missed: boolean
    perfect: boolean[]
    reveal: Arrow[]
    started: number
  }

  const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
  const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)

  let summaries = $state<Record<Color, RepSummary> | null>(null)
  let tree = $state<Repertoire | null>(null)
  let trail = $state<Step[]>([])
  let drill = $state<Drill | null>(null)
  let finished = $state<boolean[] | null>(null)
  let shake = $state(0)
  let timers: ReturnType<typeof setTimeout>[] = []

  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
  const clear = () => {
    timers.forEach(clearTimeout)
    timers = []
  }

  $effect(() => {
    const c = color
    void app.repertoire[c]
    untrack(() => {
      void api.openings().then(s => (summaries = s))
      void api.repertoire(c).then(r => {
        if (c !== color) return
        const fresh = !tree || tree.color !== c
        tree = r.tree
        if (fresh) trail = []
      })
    })
  })

  $effect(() => {
    void color
    return () => {
      clear()
      drill = null
      finished = null
    }
  })

  const summary = $derived(summaries?.[color] ?? null)
  const building = $derived(app.building[color] ?? summary?.progress ?? null)
  const fen = $derived(trail.at(-1)?.fen ?? START)
  const node = $derived<RepNode | null>(tree ? tree.nodes[trail.at(-1)?.to ?? tree.root] ?? null : null)
  const opening = $derived.by(() => {
    if (!tree) return null
    for (let i = trail.length - 1; i >= 0; i--) {
      const name = tree.nodes[trail[i].to]?.opening
      if (name) return name
    }
    return null
  })

  const go = (uci: string) => {
    const r = play(fen, uci)
    if (!r) return
    trail = [...trail, { uci, san: r.san, fen: r.fen, to: epd(r.fen) }]
  }

  const back = (length: number) => (trail = trail.slice(0, length))

  const exploreArrows = $derived.by((): Arrow[] => {
    if (!node) return []
    if (node.mine) {
      const out: Arrow[] = node.pick ? [{ uci: node.pick.uci, brush: 'best' }] : []
      if (node.fix) out.push({ uci: node.fix.uci, brush: 'threat' })
      return out
    }
    return node.moves.slice(0, 1).map(m => ({ uci: m.uci, brush: 'line' as const }))
  })

  const line = $derived(drill ? drill.lines[drill.li] : null)
  const step = $derived(drill && line ? line.steps[drill.si] ?? null : null)

  const advance = () => {
    if (!drill || !line) return
    const s = line.steps[drill.si]
    if (!s) {
      drill.status = 'complete'
      drill.perfect.push(!drill.missed)
      sfx.good()
      later(1000, nextLine)
      return
    }
    if (s.mine) {
      drill.status = 'yours'
      drill.started = performance.now()
      return
    }
    drill.status = 'auto'
    later(drill.si === 0 ? 500 : 420, () => {
      if (!drill) return
      const r = play(drill.fen, s.uci)
      if (!r) return
      drill.fen = r.fen
      drill.last = s.uci
      drill.si++
      advance()
    })
  }

  const nextLine = () => {
    if (!drill) return
    if (drill.li + 1 >= drill.lines.length) {
      finished = drill.perfect
      drill = null
      void api.openings().then(s => (summaries = s))
      return
    }
    drill.li++
    drill.si = 0
    drill.fen = START
    drill.last = null
    drill.missed = false
    drill.reveal = []
    advance()
  }

  const practice = async (all: boolean) => {
    clear()
    finished = null
    const { lines } = await api.drill(color, all)
    if (!lines.length) return
    drill = { lines, li: 0, si: 0, fen: START, last: null, status: 'auto', missed: false, perfect: [], reveal: [], started: 0 }
    advance()
  }

  const drillMove = (uci: string) => {
    if (!drill || !step || (drill.status !== 'yours' && drill.status !== 'wrong')) return
    const ok = uci === step.uci || step.accept.includes(uci)
    const before = drill.fen
    const r = play(before, uci)
    if (!r) return
    drill.fen = r.fen
    drill.last = uci
    if (!ok) {
      const first = drill.status === 'yours'
      drill.status = 'wrong'
      drill.missed = true
      drill.reveal = [{ uci: step.uci, brush: 'best' }]
      shake++
      sfx.bad()
      if (first && step.id) void api.openingResult(step.id, { solved: false, hints: 0, ms: performance.now() - drill.started })
      later(480, () => {
        if (!drill) return
        drill.fen = before
        drill.last = line!.steps[drill.si - 1]?.uci ?? null
      })
      return
    }
    if (drill.status === 'yours' && step.id && step.due) void api.openingResult(step.id, { solved: true, hints: 0, ms: performance.now() - drill.started })
    drill.reveal = []
    if (uci !== step.uci) {
      drill.status = 'alt'
      later(700, () => {
        if (!drill) return
        const fixed = play(before, step.uci)
        if (!fixed) return
        drill.fen = fixed.fen
        drill.last = step.uci
        drill.si++
        later(500, advance)
      })
      return
    }
    sfx.tick()
    drill.si++
    advance()
  }

  const onmove = (uci: string) => (drill ? drillMove(uci) : go(uci))

  const played = $derived.by(() => {
    if (!drill || !line) return []
    return line.steps.slice(0, drill.si).map((s, i) => ({ ...s, n: i }))
  })

  const mood = $derived.by((): Mood => {
    if (finished) return finished.filter(Boolean).length >= finished.length / 2 ? 'cheer' : 'ok'
    if (drill) return drill.status === 'complete' ? 'happy' : drill.status === 'wrong' ? 'oops' : drill.status === 'alt' ? 'hmm' : drill.status === 'yours' ? 'think' : 'idle'
    if (node?.fix) return 'hmm'
    return 'read'
  })

  const board = $derived(
    drill
      ? { fen: drill.fen, last: drill.last, movable: drill.status === 'yours' || drill.status === 'wrong' ? color : null, arrows: drill.reveal }
      : { fen, last: trail.at(-1)?.uci ?? null, movable: 'turn' as const, arrows: exploreArrows },
  )

  const number = (ply: number, san: string) => (ply % 2 === 0 ? `${ply / 2 + 1}. ${san}` : san)
</script>

<div class="openings">
  <div class="boardcell">
    {#if drill}
      <div class="progress-row">
        <button class="quit" onclick={() => { clear(); drill = null }} aria-label="Stop practice">
          <svg viewBox="0 0 20 20" width="22" height="22"><path d="M5.5 5.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>
        </button>
        <div class="progress"><span style="width: {Math.max(4, ((drill.li + (drill.status === 'complete' ? 1 : 0)) / drill.lines.length) * 100)}%"></span></div>
        <span class="count num">{drill.li + 1}/{drill.lines.length}</span>
      </div>
    {:else}
      <div class="progress-row trail">
        <button class="crumb" class:on={trail.length === 0} onclick={() => back(0)}>Start</button>
        {#each trail as t, i}
          <button class="crumb num" class:on={i === trail.length - 1} onclick={() => back(i + 1)}>{number(i, t.san)}</button>
        {/each}
      </div>
    {/if}
    <Board fen={board.fen} last={board.last} orientation={color} movable={board.movable} arrows={board.arrows} {shake} {onmove} />
  </div>

  <aside class="side">
    <div class="switch">
      {#each ['white', 'black'] as const as c}
        <a class="side-tab" class:on={color === c} href={href(`/openings/${c}`)}>
          <span class="swatch {c}"></span>
          As {c}
          {#if summaries?.[c]?.due}<span class="due num">{summaries[c].due}</span>{/if}
        </a>
      {/each}
    </div>

    {#if finished}
      <section class="card panel" in:fly={{ y: 8 }}>
        <div class="head">
          <Pip {mood} size={84} />
          <div>
            <div class="title">{finished.filter(Boolean).length} of {finished.length} lines perfect</div>
            <p class="soft">Lines you missed come back sooner. The rest wait until you are about to forget them.</p>
          </div>
        </div>
        <div class="actions">
          <button class="btn primary" onclick={() => practice(true)}>Practice again</button>
          <button class="btn" onclick={() => (finished = null)}>Back to repertoire</button>
        </div>
      </section>
    {:else if drill && line}
      <section class="card panel" class:won={drill.status === 'complete'} class:lost={drill.status === 'wrong'}>
        <div class="head">
          <Pip {mood} size={84} />
          <div>
            <div class="title">
              {#if drill.status === 'complete'}Line complete!
              {:else if drill.status === 'wrong'}Your move here is {step?.san}.
              {:else if drill.status === 'alt'}Also fine. Your repertoire plays {step?.san}.
              {:else if drill.status === 'yours'}Your move.
              {:else}Watch…{/if}
            </div>
            <p class="soft">{line.opening ?? 'Your repertoire'}{line.fix ? ' · fixing a habit' : ''}</p>
          </div>
        </div>
        <div class="line-moves num">
          {#each played as s}
            <span class:mine={s.mine}>{number(s.n, s.san)}</span>
          {/each}
          {#if drill.status !== 'complete'}<span class="blank">?</span>{/if}
        </div>
        <div class="actions">
          <button class="btn" onclick={nextLine}>Skip line</button>
        </div>
      </section>
    {:else if !tree}
      <section class="card panel">
        <div class="head">
          <Pip mood={summary?.status === 'empty' ? 'sleep' : 'think'} size={84} />
          <div>
            <div class="title">{summary?.status === 'empty' ? `No games as ${color} yet` : 'Building your repertoire'}</div>
            <p class="soft">{summary?.status === 'empty' ? 'Sync some games first.' : 'Reading your games and checking every opening position with the engine.'}</p>
          </div>
        </div>
        {#if building && building.total}
          <div class="meter"><span style="width: {(building.done / building.total) * 100}%"></span></div>
        {/if}
      </section>
    {:else}
      <section class="card panel stats">
        <div class="stat"><b class="num">{summary?.games ?? tree.games}</b><span>games</span></div>
        <div class="stat"><b class="num">{pct(tree.score)}</b><span>score</span></div>
        <div class="stat"><b class="num">{summary?.positions ?? 0}</b><span>positions</span></div>
        <div class="stat warn"><b class="num">{summary?.fixes ?? 0}</b><span>to fix</span></div>
        <button class="btn primary wide" onclick={() => practice(!(summary?.due))}>
          {summary?.due ? `Practice ${Math.min(8, summary.due)} lines` : 'Practice anyway'}
        </button>
      </section>

      <section class="card panel explorer">
        <div class="head">
          <Pip {mood} size={64} />
          <div>
            <span class="label">{node ? (node.mine ? 'Your move' : 'They play') : 'Off the map'}</span>
            <div class="title">
              {#if node?.mine && node.pick}{node.pick.san}{:else if node}{node.moves[0]?.san ?? '…'}{:else}Not in your repertoire{/if}
            </div>
            {#if opening}<p class="soft small">{opening}</p>{/if}
          </div>
        </div>

        {#if node?.fix && node.pick}
          <div class="callout fix">
            <span class="label">Habit to fix</span>
            <p>You usually play <b>{node.fix.san}</b> here ({node.fix.games} {node.fix.games === 1 ? 'game' : 'games'}). <b>{node.pick.san}</b> is stronger.</p>
          </div>
        {:else if node?.prep && node.mine}
          <div class="callout prep">
            <span class="label">Be ready</span>
            <p>You haven't faced this yet, but players at your level play it. Answer with <b>{node.pick?.san}</b>.</p>
          </div>
        {/if}

        {#if node && node.moves.length}
          <div class="rows">
            {#each node.moves as m (m.uci)}
              {@const tag = node.mine ? (node.pick?.uci === m.uci ? 'Repertoire' : node.fix?.uci === m.uci ? 'Fix' : null) : m.prep ? 'New' : null}
              <button class="row" onclick={() => go(m.uci)}>
                <span class="san num">{m.san}</span>
                {#if tag}<span class="tag {tag.toLowerCase()}">{tag}</span>{/if}
                <span class="grow"></span>
                <span class="soft small num">{m.games ? `${m.games} ${m.games === 1 ? 'game' : 'games'}` : ''}</span>
                <span class="score"><span style="width: {(m.score ?? 0) * 100}%"></span></span>
                <span class="num small pctv">{pct(m.score)}</span>
              </button>
            {/each}
          </div>
        {:else if node?.mine && node.pick}
          <button class="row" onclick={() => go(node!.pick!.uci)}>
            <span class="san num">{node.pick.san}</span><span class="tag repertoire">Repertoire</span>
          </button>
        {:else}
          <p class="soft">Your games rarely reach this position. Step back or practice the main lines.</p>
        {/if}
      </section>
    {/if}
  </aside>
</div>

<style>
  .openings {
    --board: min(calc(100vh - 190px), 640px, calc(100vw - 540px));
    display: grid;
    grid-template-columns: var(--board) minmax(360px, 420px);
    gap: 32px;
    justify-content: center;
    padding: 20px 28px;
  }
  .boardcell {
    width: var(--board);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .progress-row {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 40px;
  }
  .trail {
    flex-wrap: wrap;
    gap: 6px;
    min-height: 40px;
  }
  .crumb {
    padding: 5px 11px;
    border-radius: 10px;
    border: 2px solid var(--line);
    font-size: 14px;
    font-weight: 800;
    color: var(--dim);
    transition: color 0.15s, border-color 0.15s;
  }
  .crumb:hover {
    color: var(--text);
  }
  .crumb.on {
    color: var(--accent);
    border-color: var(--accent);
  }
  .quit {
    color: var(--faint);
    display: grid;
    place-items: center;
  }
  .quit:hover {
    color: var(--text);
  }
  .progress {
    flex: 1;
    height: 18px;
    border-radius: 18px;
    background: var(--line);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    border-radius: 18px;
    background: var(--accent);
    box-shadow: inset 0 -4px 0 var(--accent-d), inset 0 4px 0 rgb(255 255 255 / 0.25);
    transition: width 0.5s var(--spring);
  }
  .count {
    font-weight: 900;
    color: var(--dim);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .side-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: 48px;
    border-radius: 14px;
    border: 2px solid var(--line);
    border-bottom-width: 4px;
    color: var(--dim);
    text-decoration: none;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 14px;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .side-tab.on {
    color: var(--accent);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 4px;
  }
  .swatch.white {
    background: var(--ivory);
  }
  .swatch.black {
    background: #050505;
    box-shadow: inset 0 0 0 2px var(--line-2);
  }
  .due {
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    font-size: 12.5px;
    color: var(--accent-ink);
    background: var(--accent);
  }
  .panel {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: background 0.2s, border-color 0.2s;
  }
  .panel.won {
    background: color-mix(in srgb, var(--accent) 10%, var(--panel));
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .panel.lost {
    background: color-mix(in srgb, var(--red) 9%, var(--panel));
    border-color: color-mix(in srgb, var(--red) 50%, transparent);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .title {
    font-size: 24px;
    font-weight: 900;
    line-height: 1.2;
  }
  .soft {
    color: var(--dim);
    margin: 4px 0 0;
  }
  .small {
    font-size: 14px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .stat b {
    font-size: 24px;
    font-weight: 900;
    line-height: 1.1;
  }
  .stat span {
    font-size: 13px;
    color: var(--dim);
  }
  .stat.warn b {
    color: var(--orange);
  }
  .wide {
    grid-column: 1 / -1;
  }
  .callout {
    padding: 12px 14px;
    border-radius: 14px;
    border: 2px solid;
  }
  .callout p {
    margin: 4px 0 0;
    font-size: 15.5px;
    line-height: 1.45;
  }
  .callout.fix {
    background: color-mix(in srgb, var(--orange) 10%, transparent);
    border-color: color-mix(in srgb, var(--orange) 50%, transparent);
  }
  .callout.fix .label {
    color: var(--orange);
  }
  .callout.prep {
    background: color-mix(in srgb, var(--accent) 9%, transparent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .callout.prep .label {
    color: var(--accent);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: calc(var(--board) - 330px);
    min-height: 120px;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 12px;
    background: var(--bg);
    border: 2px solid var(--line);
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }
  .row:hover {
    border-color: var(--line-2);
    background: var(--panel-2);
  }
  .san {
    font-weight: 900;
    font-size: 16.5px;
    min-width: 48px;
  }
  .grow {
    flex: 1;
  }
  .tag {
    font-size: 11.5px;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 8px;
  }
  .tag.repertoire {
    color: var(--c-best);
    background: color-mix(in srgb, var(--c-best) 15%, transparent);
  }
  .tag.fix {
    color: var(--orange);
    background: color-mix(in srgb, var(--orange) 15%, transparent);
  }
  .tag.new {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }
  .score {
    width: 64px;
    height: 8px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--red) 45%, var(--bg));
    overflow: hidden;
  }
  .score span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .pctv {
    width: 38px;
    text-align: right;
    font-weight: 800;
  }
  .line-moves {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    font-size: 16px;
    font-weight: 800;
    color: var(--dim);
  }
  .line-moves .mine {
    color: var(--text);
  }
  .blank {
    color: var(--accent);
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  .actions > :global(*) {
    flex: 1;
  }
  .meter {
    height: 14px;
    border-radius: 14px;
    background: var(--line);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    border-radius: 14px;
    background: var(--accent);
    transition: width 0.4s var(--ease);
  }
  @media (max-width: 1000px) {
    .openings {
      --board: min(calc(100vw - 48px), 640px);
      grid-template-columns: 1fr;
    }
    .rows {
      max-height: none;
    }
  }
</style>
