<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import Board, { type Arrow } from '../components/Board.svelte'
  import Pip from '../components/Pip.svelte'
  import Avatar from '../components/Avatar.svelte'
  import { api, type EvalLine } from '../lib/api.ts'
  import { app } from '../lib/state.svelte.ts'
  import { START, play, turnOf } from '../lib/chess.ts'
  import { clock as clockText, evalText } from '../lib/format.ts'
  import { sfx } from '../lib/sound.ts'
  import { go } from '../lib/router.svelte.ts'
  import { toast } from '../lib/toast.svelte.ts'
  import type { Color, Mood } from '../../../shared/types.ts'

  const LEVELS = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 0]
  const CLOCKS = [
    { label: 'No clock', base: 0, inc: 0 },
    { label: '10 min', base: 600, inc: 0 },
    { label: '5 + 3', base: 300, inc: 3 },
    { label: '3 + 2', base: 180, inc: 2 },
  ]
  const KEY = 'pip.play'
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}')
    } catch {
      return {}
    }
  })()

  interface Ply {
    uci: string
    san: string
    fen: string
    clock: number | null
  }

  interface Warning {
    uci: string
    san: string
    reply: string
    replyUci: string
    from: string
    to: string
    line: string[]
  }

  let stage = $state<'setup' | 'playing' | 'over'>('setup')
  let side = $state<'white' | 'black' | 'random'>(saved.side ?? 'white')
  let level = $state<number>(saved.level ?? 1200)
  let timing = $state<number>(saved.timing ?? 0)
  let guard = $state<boolean>(saved.guard ?? true)

  let you = $state<Color>('white')
  let history = $state<Ply[]>([])
  let result = $state<{ score: string; reason: string } | null>(null)
  let clocks = $state<Record<Color, number>>({ white: 0, black: 0 })
  let thinking = $state(false)
  let speech = $state('')
  let mood = $state<Mood>('idle')
  let warning = $state<Warning | null>(null)
  let hint = $state<string | null>(null)
  let hints = $state(0)
  let shake = $state(0)
  let checking = $state(false)
  let before: { fen: string; lines: Promise<EvalLine[]> } | null = null
  let ticker: ReturnType<typeof setInterval> | undefined
  let tickAt = 0

  $effect(() => {
    localStorage.setItem(KEY, JSON.stringify({ side, level, timing, guard }))
  })

  const fen = $derived(history.at(-1)?.fen ?? START)
  const turn = $derived(turnOf(fen))
  const timed = $derived(CLOCKS[timing].base > 0)
  const pipColor = $derived<Color>(you === 'white' ? 'black' : 'white')
  const pipName = $derived(level ? `Pip · ${level}` : 'Pip · full strength')
  const myTurn = $derived(stage === 'playing' && turn === you && !thinking && !warning && !checking)

  const signed = (l: EvalLine) => {
    const flip = you === 'white' ? 1 : -1
    const mine = l.mate !== null ? l.mate * flip : (l.cp ?? 0) * flip
    return `${mine >= 0 ? '+' : '−'}${evalText(l.cp, l.mate)}`
  }

  const say = (text: string, m: Mood = mood) => {
    speech = text
    mood = m
  }

  const evaluate = (at: string) => {
    if (before?.fen !== at) before = { fen: at, lines: api.evaluate(at).then(r => r.lines).catch(() => []) }
    return before.lines
  }

  const repetition = (list: Ply[]) => {
    const seen = new Map<string, number>()
    for (const p of list) {
      const key = p.fen.split(' ').slice(0, 4).join(' ')
      const n = (seen.get(key) ?? 0) + 1
      if (n >= 3) return true
      seen.set(key, n)
    }
    return false
  }

  const finish = (score: string, reason: string) => {
    stage = 'over'
    result = { score, reason }
    clearInterval(ticker)
    const mine = score === '1/2-1/2' ? 0.5 : score === (you === 'white' ? '1-0' : '0-1') ? 1 : 0
    if (mine === 1) {
      sfx.great()
      say(`${reason}. Well played!`, 'cheer')
    } else if (mine === 0) {
      sfx.bad()
      say(`${reason}. Let's look at what happened.`, 'proud')
    } else say(`${reason}. A fair result.`, 'ok')
  }

  const settle = (list: Ply[]) => {
    const last = list.at(-1)
    if (!last) return false
    const r = play(list.at(-2)?.fen ?? START, last.uci)
    if (!r) return false
    if (r.mate) {
      finish(turnOf(last.fen) === 'white' ? '0-1' : '1-0', 'Checkmate')
      return true
    }
    if (r.end) {
      finish('1/2-1/2', 'Draw')
      return true
    }
    if (repetition(list)) {
      finish('1/2-1/2', 'Draw by repetition')
      return true
    }
    if (+last.fen.split(' ')[4] >= 100) {
      finish('1/2-1/2', 'Draw by the fifty-move rule')
      return true
    }
    return false
  }

  const startClock = () => {
    clearInterval(ticker)
    if (!timed) return
    tickAt = performance.now()
    ticker = setInterval(() => {
      const now = performance.now()
      if (stage !== 'playing' || warning || checking) {
        tickAt = now
        return
      }
      const side = turnOf(fen)
      clocks[side] = Math.max(0, clocks[side] - (now - tickAt) / 1000)
      tickAt = now
      if (clocks[side] === 0) finish(side === 'white' ? '0-1' : '1-0', `${side === you ? 'You' : 'Pip'} ran out of time`)
    }, 100)
  }

  const push = (uci: string) => {
    const mover = turnOf(fen)
    const r = play(fen, uci)
    if (!r) return null
    if (timed) clocks[mover] += CLOCKS[timing].inc
    history = [...history, { uci, san: r.san, fen: r.fen, clock: timed ? Math.round(clocks[mover] * 10) / 10 : null }]
    return r
  }

  const pipMove = async () => {
    if (stage !== 'playing') return
    thinking = true
    mood = 'think'
    const at = fen
    const delay = new Promise(r => setTimeout(r, 450 + Math.random() * 700))
    const [{ uci }] = await Promise.all([api.spar(at, level || 2400, level ? 'maia' : 'engine'), delay])
    if (stage !== 'playing' || fen !== at || !uci) {
      thinking = false
      return
    }
    const r = push(uci)
    thinking = false
    if (!r || settle(history)) return
    if (r.check) say('Check!', 'proud')
    else if (r.capture) say(['I’ll take that.', 'Thank you!', 'Mine now.'][history.length % 3], 'happy')
    else mood = 'idle'
    void evaluate(fen)
  }

  const onmove = async (uci: string) => {
    if (!myTurn) return
    hint = null
    const at = fen
    const r = push(uci)
    if (!r) return
    if (settle(history)) return
    if (!guard) return void pipMove()
    checking = true
    const [prior, after] = await Promise.all([evaluate(at), api.evaluate(r.fen).then(x => x.lines).catch(() => [] as EvalLine[])])
    checking = false
    if (stage !== 'playing') return
    const mine = (l: EvalLine | undefined) => (l ? (you === 'white' ? l.white : 1 - l.white) : null)
    const was = mine(prior[0])
    const now = mine(after[0])
    if (was !== null && now !== null && was - now >= 0.15 && prior[0]?.uci !== uci) {
      warning = { uci, san: r.san, reply: after[0].san, replyUci: after[0].uci, from: signed(prior[0]), to: signed(after[0]), line: after[0].line }
      say(`Wait. After ${r.san}, I can play ${after[0].san}.`, 'worried')
      sfx.bad()
      return
    }
    if (prior[0]?.uci === uci && Math.random() < 0.35) say(['Nice move.', 'That’s the one.', 'Good find.'][history.length % 3], 'happy')
    void pipMove()
  }

  const takeBack = () => {
    warning = null
    const next = [...history]
    const mover = () => (next.length ? turnOf(next.at(-1)!.fen) : 'white')
    do next.pop()
    while (next.length && mover() !== you)
    history = next
    say('Take your time.', 'ok')
    if (mover() === you) void evaluate(fen)
    else void pipMove()
  }

  const keepIt = () => {
    warning = null
    say('Brave! Let’s see.', 'hmm')
    void pipMove()
  }

  const useHint = async () => {
    if (!myTurn) return
    const lines = await evaluate(fen)
    if (!lines[0]) return
    hints++
    hint = lines[0].uci.slice(0, 2)
    say('Look at the highlighted piece.', 'hmm')
  }

  const begin = () => {
    you = side === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : side
    history = []
    result = null
    warning = null
    hint = null
    hints = 0
    clocks = { white: CLOCKS[timing].base, black: CLOCKS[timing].base }
    stage = 'playing'
    say(level ? `I'll play like a ${level} player. Good luck!` : 'Full strength. Good luck!', 'happy')
    startClock()
    if (you === 'black') void pipMove()
    else void evaluate(START)
  }

  const resign = () => finish(you === 'white' ? '0-1' : '1-0', 'You resigned')

  const offerDraw = async () => {
    const lines = await evaluate(fen)
    const w = lines[0]?.white ?? 0.5
    if (history.length >= 30 && w > 0.42 && w < 0.58) finish('1/2-1/2', 'Draw agreed')
    else say(history.length < 30 ? 'Too early for a draw. Let’s play!' : 'No thanks, I still like my chances.', 'proud')
  }

  const pgn = () => {
    const tag = (k: string, v: string) => `[${k} "${v}"]`
    const d = new Date()
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
    const me = app.me?.username ?? 'You'
    const mineRating = String(app.me?.rating ?? '')
    const pipRating = String(level || 2800)
    const body = history.map((p, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${p.san}${p.clock !== null ? ` {[%clk ${clockText(p.clock)}]}` : ''}`).join(' ')
    return [
      tag('Event', 'Pip coach game'),
      tag('Site', 'Pip'),
      tag('Date', date),
      tag('White', you === 'white' ? me : 'Pip'),
      tag('Black', you === 'black' ? me : 'Pip'),
      tag('WhiteElo', you === 'white' ? mineRating : pipRating),
      tag('BlackElo', you === 'black' ? mineRating : pipRating),
      tag('TimeControl', timed ? `${CLOCKS[timing].base}+${CLOCKS[timing].inc}` : '-'),
      tag('Result', result?.score ?? '*'),
      '',
      `${body} ${result?.score ?? '*'}`,
    ].join('\n')
  }

  const review = async () => {
    if (history.length < 2) return
    try {
      const { id } = await api.importPgn(pgn(), 'pip')
      go(`/game/${encodeURIComponent(id)}`)
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  $effect(() => () => clearInterval(ticker))

  const arrows = $derived<Arrow[]>(warning ? [{ uci: warning.replyUci, brush: 'threat' }] : [])
  const rows = $derived.by(() => {
    const out: { no: number; white?: string; black?: string }[] = []
    history.forEach((p, i) => {
      if (i % 2 === 0) out.push({ no: i / 2 + 1, white: p.san })
      else out[out.length - 1].black = p.san
    })
    return out
  })
  let list: HTMLElement | undefined = $state()
  $effect(() => {
    void history.length
    list?.scrollTo({ top: list.scrollHeight })
  })
</script>

{#snippet strip(color: Color)}
  {@const pip = color === pipColor}
  <div class="strip" class:active={stage === 'playing' && turn === color}>
    {#if pip}
      <span class="pip-face"><Pip mood={thinking ? 'think' : mood} size={30} /></span>
      <span class="name">{pipName}</span>
    {:else}
      <Avatar name={app.me?.username ?? 'You'} size={34} />
      <span class="name">{app.me?.username ?? 'You'}</span>
      {#if app.me?.rating}<span class="faint num">{app.me.rating}</span>{/if}
    {/if}
    <span class="grow"></span>
    {#if pip && thinking}<span class="thinking">thinking…</span>{/if}
    {#if timed && stage !== 'setup'}<span class="clock num" class:low={clocks[color] < 20}>{clockText(clocks[color])}</span>{/if}
  </div>
{/snippet}

{#if stage === 'setup'}
  <div class="setup" in:fly={{ y: 10, duration: 360 }}>
    <div class="intro">
      <Pip mood="happy" size={92} follow />
      <h1>Play Pip</h1>
      <p class="soft">A sparring partner that plays like a real person at your level, and stops you before you blunder if you want.</p>
    </div>
    <div class="card form">
      <div class="field">
        <span class="label">You play</span>
        <div class="choices three">
          {#each ['white', 'random', 'black'] as const as s}
            <button class="choice" class:on={side === s} onclick={() => (side = s)}>
              <span class="swatch {s}"></span>{s}
            </button>
          {/each}
        </div>
      </div>
      <div class="field">
        <span class="label">Pip's strength <b class="num">{level ? level : 'Full strength'}</b></span>
        <input type="range" min="0" max={LEVELS.length - 1} step="1" value={LEVELS.indexOf(level)} oninput={e => (level = LEVELS[+(e.currentTarget as HTMLInputElement).value])} aria-label="Pip's strength" />
        <div class="scale"><span>Beginner</span><span>Club</span><span>Expert</span><span>Engine</span></div>
      </div>
      <div class="field">
        <span class="label">Clock</span>
        <div class="choices four">
          {#each CLOCKS as c, i}
            <button class="choice" class:on={timing === i} onclick={() => (timing = i)}>{c.label}</button>
          {/each}
        </div>
      </div>
      <label class="toggle">
        <span>
          <b>Blunder guard</b>
          <small>Pip warns you before you make a big mistake.</small>
        </span>
        <input type="checkbox" bind:checked={guard} /><i></i>
      </label>
      <button class="btn primary big" onclick={begin}>Start game</button>
    </div>
  </div>
{:else}
  <div class="arena">
    <div class="stage">
      {@render strip(you === 'white' ? 'black' : 'white')}
      <Board {fen} last={history.at(-1)?.uci ?? null} orientation={you} movable={myTurn ? you : null} {arrows} {hint} {shake} {onmove} />
      {@render strip(you)}
    </div>

    <aside class="side">
      <section class="card coach">
        <div class="head">
          <Pip mood={thinking ? 'think' : mood} size={80} />
          {#key speech}
            <p class="speech" in:fade={{ duration: 160 }}>{speech}</p>
          {/key}
        </div>
        {#if warning}
          <div class="warning" in:fly={{ y: 6 }}>
            <span class="label">Blunder guard</span>
            <p>{warning.san} lets me play <b>{warning.reply}</b> ({warning.line.slice(0, 4).join(' ')}). Your position would go from <b>{warning.from}</b> to <b>{warning.to}</b>.</p>
            <div class="actions">
              <button class="btn primary" onclick={takeBack}>Take it back</button>
              <button class="btn" onclick={keepIt}>Play it anyway</button>
            </div>
          </div>
        {:else if stage === 'over' && result}
          <div class="over" in:fly={{ y: 6 }}>
            <div class="score num">{result.score}</div>
            <div class="actions">
              <button class="btn primary" onclick={review} disabled={history.length < 2}>Review with Pip</button>
              <button class="btn" onclick={begin}>Rematch</button>
            </div>
            <button class="btn ghost" onclick={() => (stage = 'setup')}>Change settings</button>
          </div>
        {:else}
          <div class="actions">
            <button class="btn" onclick={useHint} disabled={!myTurn}>Hint{hints ? ` · ${hints}` : ''}</button>
            <button class="btn" onclick={takeBack} disabled={history.length < 1 || thinking || checking}>Undo</button>
          </div>
        {/if}
      </section>

      <section class="card moves" bind:this={list}>
        {#each rows as r}
          <div class="row num"><span class="no">{r.no}</span><span>{r.white ?? ''}</span><span>{r.black ?? ''}</span></div>
        {:else}
          <p class="soft empty">{you === 'white' ? 'Your move. White starts.' : 'Pip moves first.'}</p>
        {/each}
      </section>

      {#if stage === 'playing'}
        <div class="actions footer">
          <button class="btn ghost" onclick={offerDraw}>Offer draw</button>
          <button class="btn ghost danger" onclick={resign}>Resign</button>
        </div>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .setup {
    display: grid;
    grid-template-columns: minmax(0, 360px) minmax(0, 460px);
    gap: 56px;
    align-items: start;
    justify-content: center;
    padding: 64px 24px 40px;
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h1 {
    font-size: 44px;
    margin: 10px 0 0;
  }
  .soft {
    color: var(--dim);
    margin: 0;
    font-size: 17px;
    line-height: 1.5;
  }
  .form {
    padding: 26px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .field .label b {
    color: var(--accent);
    margin-left: 6px;
  }
  .choices {
    display: grid;
    gap: 8px;
  }
  .three {
    grid-template-columns: repeat(3, 1fr);
  }
  .four {
    grid-template-columns: repeat(4, 1fr);
  }
  .choice {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 46px;
    border-radius: 14px;
    border: 1px solid var(--line);
    border-bottom-width: 4px;
    font-weight: 800;
    font-size: 14.5px;
    text-transform: capitalize;
    color: var(--dim);
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .choice:hover {
    color: var(--text);
  }
  .choice.on {
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
  .swatch.random {
    background: linear-gradient(135deg, var(--ivory) 50%, #050505 50%);
    box-shadow: inset 0 0 0 2px var(--line-2);
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
    height: 28px;
  }
  .scale {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--faint);
    font-weight: 700;
  }
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    cursor: pointer;
  }
  .toggle span {
    display: flex;
    flex-direction: column;
  }
  .toggle small {
    color: var(--dim);
    font-size: 14px;
  }
  .toggle input {
    display: none;
  }
  .toggle i {
    flex: none;
    width: 48px;
    height: 28px;
    border-radius: 28px;
    background: var(--line-2);
    position: relative;
    transition: background 0.2s;
  }
  .toggle i::after {
    content: '';
    position: absolute;
    top: 4px;
    left: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.3s var(--spring);
  }
  .toggle input:checked + i {
    background: var(--accent);
  }
  .toggle input:checked + i::after {
    transform: translateX(20px);
  }
  .big {
    height: 54px;
    font-size: 16px;
  }
  .arena {
    --board: min(calc(100vh - 210px), 660px, calc(100vw - 520px));
    display: grid;
    grid-template-columns: var(--board) minmax(340px, 400px);
    gap: 32px;
    justify-content: center;
    padding: 16px 28px 24px;
  }
  .stage {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .strip {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 42px;
    font-weight: 800;
  }
  .pip-face {
    width: 34px;
    height: 34px;
    border-radius: 30%;
    background: var(--panel-2);
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .grow {
    flex: 1;
  }
  .thinking {
    color: var(--dim);
    font-size: 14px;
  }
  .clock {
    padding: 4px 14px;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--line);
    font-size: 17px;
    font-weight: 900;
    color: var(--dim);
  }
  .active .clock {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent-d);
  }
  .active .clock.low {
    background: var(--red);
    border-color: var(--red-d);
    color: #fff;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-height: calc(var(--board) + 104px);
  }
  .coach {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .speech {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    line-height: 1.35;
  }
  .warning {
    padding: 14px 16px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--red) 10%, transparent);
    border: 2px solid color-mix(in srgb, var(--red) 50%, transparent);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .warning .label {
    color: var(--red);
  }
  .warning p {
    margin: 0;
    font-size: 15.5px;
    line-height: 1.45;
  }
  .over {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }
  .score {
    font-size: 40px;
    font-weight: 900;
    text-align: center;
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  .actions > :global(*) {
    flex: 1;
  }
  .moves {
    flex: 1;
    min-height: 120px;
    overflow-y: auto;
    padding: 8px;
  }
  .row {
    display: grid;
    grid-template-columns: 40px 1fr 1fr;
    padding: 6px 10px;
    border-radius: 10px;
    font-weight: 800;
    font-size: 15.5px;
  }
  .row:nth-child(odd) {
    background: color-mix(in srgb, var(--bg) 50%, transparent);
  }
  .no {
    color: var(--faint);
  }
  .empty {
    padding: 12px;
    font-size: 15px;
  }
  .footer .danger {
    --ink: var(--red);
  }
  @media (max-width: 1000px) {
    .setup {
      grid-template-columns: 1fr;
    }
    .arena {
      --board: min(calc(100vw - 48px), 640px);
      grid-template-columns: 1fr;
    }
    .side {
      max-height: none;
    }
  }
</style>
