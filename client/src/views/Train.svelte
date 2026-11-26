<script lang="ts">
  import { untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import Board, { type Arrow } from '../components/Board.svelte'
  import Pip from '../components/Pip.svelte'
  import Count from '../components/Count.svelte'
  import Avatar from '../components/Avatar.svelte'
  import Sponsor from '../components/Sponsor.svelte'
  import { api } from '../lib/api.ts'
  import { play, turnOf } from '../lib/chess.ts'
  import { sfx } from '../lib/sound.ts'
  import { go } from '../lib/router.svelte.ts'
  import { MOTIFS } from '../../../shared/themes.ts'
  import type { Card, Color, Mood, TrainSession } from '../../../shared/types.ts'

  let { theme }: { theme: string | null } = $props()

  type Outcome = 'ok' | 'hint' | 'fail'
  type Status = 'play' | 'wrong' | 'solved' | 'failed'

  const PICKS = ['fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'mateIn2', 'endgame', 'defensiveMove']

  let session = $state<TrainSession | null>(null)
  let queue = $state<Card[]>([])
  let index = $state(0)
  let stage = $state<'intro' | 'solve' | 'done'>('intro')
  let outcomes = $state<Outcome[]>([])
  let rating = $state(1500)
  let startRating = $state(1500)

  let fen = $state('')
  let last = $state<string | null>(null)
  let step = $state(0)
  let tries = $state(0)
  let hints = $state(0)
  let hint = $state<string | null>(null)
  let status = $state<Status>('play')
  let shake = $state(0)
  let reveal = $state<Arrow[]>([])
  let orientation = $state<Color>('white')
  let startedAt = 0
  let timers: ReturnType<typeof setTimeout>[] = []

  const card = $derived(queue[index] ?? null)
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
  const clear = () => {
    timers.forEach(clearTimeout)
    timers = []
  }

  const load = async (pick: string | null) => {
    session = await api.train(pick ?? undefined)
    rating = startRating = session.puzzleRating
  }

  $effect(() => {
    const t = theme
    untrack(() => {
      stage = 'intro'
      void load(t)
    })
    return clear
  })

  const words = (key: string) => (key in MOTIFS ? MOTIFS[key as keyof typeof MOTIFS].name : key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/(\d)/, ' $1'))

  const begin = () => {
    if (!session) return
    queue = [...session.due, ...session.drills]
    outcomes = []
    index = 0
    stage = queue.length ? 'solve' : 'done'
    if (queue.length) open(queue[0])
  }

  const open = (c: Card) => {
    clear()
    fen = c.fen
    last = null
    step = 0
    tries = 0
    hints = 0
    hint = null
    reveal = []
    status = 'play'
    const mover = turnOf(c.fen)
    orientation = c.lead ? (mover === 'white' ? 'black' : 'white') : mover
    startedAt = performance.now()
    if (c.lead) {
      const lead = c.lead
      later(550, () => {
        const r = play(c.fen, lead)
        if (!r) return
        fen = r.fen
        last = lead
        startedAt = performance.now()
      })
    }
  }

  const finish = async (solved: boolean) => {
    if (!card) return
    const outcome: Outcome = !solved ? 'fail' : hints ? 'hint' : 'ok'
    outcomes[index] = outcome
    status = solved ? 'solved' : 'failed'
    if (solved) sfx.great()
    const res = await api.result(card.id, { solved, hints, ms: performance.now() - startedAt })
    rating = res.puzzleRating
    if (solved) later(1300, next)
  }

  const next = () => {
    if (index + 1 >= queue.length) {
      stage = 'done'
      clear()
      return
    }
    index++
    open(queue[index])
  }

  const reply = () => {
    if (!card || step >= card.moves.length) return
    const uci = card.moves[step]
    later(400, () => {
      const r = play(fen, uci)
      if (!r) return
      fen = r.fen
      last = uci
      step++
    })
  }

  const showSolution = () => {
    if (!card) return
    const rest = card.moves.slice(step)
    rest.forEach((uci, i) =>
      later(450 + i * 650, () => {
        const r = play(fen, uci)
        if (!r) return
        fen = r.fen
        last = uci
        step++
      }),
    )
    reveal = rest[0] ? [{ uci: rest[0], brush: 'best' }] : []
    void finish(false)
  }

  const onmove = (uci: string) => {
    if (!card || status !== 'play') return
    const expected = card.moves[step]
    const before = fen
    const beforeLast = last
    const r = play(fen, uci)
    if (!r) return
    fen = r.fen
    last = uci
    const alternative = step === 0 && uci !== expected && card.accept.includes(uci)
    const mates = r.mate && step === card.moves.length - 1
    if (uci === expected || alternative || mates) {
      hint = null
      step++
      if (step >= card.moves.length || alternative || mates) void finish(true)
      else {
        sfx.tick()
        reply()
      }
      return
    }
    tries++
    shake++
    sfx.bad()
    status = 'wrong'
    later(520, () => {
      fen = before
      last = beforeLast
      status = 'play'
      if (tries >= 2) showSolution()
    })
  }

  const useHint = () => {
    if (!card || status !== 'play') return
    if (!hint) {
      hint = card.moves[step].slice(0, 2)
      hints++
    } else showSolution()
  }

  const mood = $derived.by((): Mood => {
    if (stage === 'done') return outcomes.filter(o => o === 'ok').length >= outcomes.length / 2 ? 'cheer' : 'ok'
    if (stage === 'intro') return 'idle'
    return status === 'solved' ? 'cheer' : status === 'failed' ? 'sad' : status === 'wrong' ? 'oops' : hint ? 'hmm' : 'think'
  })

  const prompt = $derived.by(() => {
    if (!card) return ''
    if (status === 'solved') return ['Nice one!', 'That’s it!', 'Spot on!', 'Exactly!'][index % 4]
    if (status === 'failed') return 'Here’s the idea.'
    if (status === 'wrong') return 'Not that one.'
    if (card.kind === 'mistake' && step === 0) return `Find the move you missed.`
    return `${orientation === 'white' ? 'White' : 'Black'} to play.`
  })

  const solvedCount = $derived(outcomes.filter(o => o !== 'fail').length)
  const done = $derived(outcomes.filter(Boolean).length)
</script>

{#if !session}
  <div class="center"><Pip mood="think" size={80} /></div>
{:else if stage === 'intro'}
  <div class="center intro" in:fly={{ y: 10, duration: 360 }}>
    <Pip mood="happy" size={110} follow />
    <span class="label">Puzzle rating</span>
    <div class="rating num"><Count value={rating} /></div>
    <div class="facts">
      <div class="fact card"><b class="num">{session.due.length}</b><span>from your games</span></div>
      <div class="fact card"><b class="num">{session.drills.length}</b><span>{theme ? words(theme).toLowerCase() : 'focus'} drills</span></div>
      <div class="fact card"><b class="num">{session.stats.learned}</b><span>learned</span></div>
    </div>
    <button class="btn primary big" onclick={begin} disabled={!session.due.length && !session.drills.length}>Start training</button>
    <div class="picks">
      {#each [...new Set([...session.focus.map(f => f.theme), ...PICKS])].slice(0, 9) as t}
        <button class="pick" class:on={theme === t} onclick={() => go(theme === t ? '/train' : `/train?theme=${t}`)}>{words(t)}</button>
      {/each}
    </div>
  </div>
{:else if stage === 'done'}
  <div class="center intro" in:fly={{ y: 10, duration: 360 }}>
    <Pip {mood} size={110} />
    <h2>{solvedCount} of {outcomes.length} solved</h2>
    <p class="soft">
      Puzzle rating <b>{rating}</b>
      {#if rating !== startRating}<span class={rating > startRating ? 'up' : 'down'}>{rating > startRating ? '+' : ''}{rating - startRating}</span>{/if}
    </p>
    <p class="soft small">Missed puzzles come back right before you would forget them.</p>
    <button class="btn primary big" onclick={() => load(theme).then(begin)}>Another round</button>
    <div class="sponsor-slot"><Sponsor placement="trained" /></div>
  </div>
{:else if card}
  <div class="train">
    <div class="progress-row">
      <button class="quit" onclick={() => (stage = 'done')} aria-label="End session">
        <svg viewBox="0 0 20 20" width="22" height="22"><path d="M5.5 5.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>
      </button>
      <div class="progress"><span style="width: {Math.max(4, (done / queue.length) * 100)}%"></span></div>
      <span class="count num">{index + 1}/{queue.length}</span>
    </div>
    <div class="boardcell">
      <Board {fen} {last} {orientation} movable={status === 'play' ? orientation : null} arrows={reveal} {hint} {shake} {onmove} />
    </div>
    <aside class="side">
      <div class="panel card" class:won={status === 'solved'} class:lost={status === 'failed'}>
        <div class="head">
          <Pip {mood} size={84} />
          <div>
            <div class="prompt">{prompt}</div>
            {#if card.game}
              <div class="context"><Avatar name={card.game.opponent} size={24} /><span>vs {card.game.opponent} · you played {card.game.san}</span></div>
            {:else}
              <div class="context"><span>Puzzle {card.rating} · {card.themes.filter(t => !['short', 'long', 'oneMove', 'veryLong', 'crushing', 'advantage', 'middlegame', 'opening', 'endgame'].includes(t)).slice(0, 2).map(words).join(', ').toLowerCase() || 'tactics'}</span></div>
            {/if}
          </div>
        </div>
        <div class="actions">
          {#if status === 'play' || status === 'wrong'}
            <button class="btn" onclick={useHint}>{hint ? 'Show solution' : 'Hint'}</button>
            <button class="btn ghost" onclick={showSolution}>Skip</button>
          {:else}
            <button class="btn {status === 'solved' ? 'primary' : 'danger'}" onclick={next}>{index + 1 >= queue.length ? 'Finish' : 'Continue'}</button>
            {#if card.game}<a class="btn ghost" href="/game/{encodeURIComponent(card.game.id)}">Open game</a>{/if}
          {/if}
        </div>
      </div>
      <div class="meta soft small num">Puzzle rating {rating}</div>
    </aside>
  </div>
{/if}

<style>
  .sponsor-slot {
    width: min(520px, 100%);
    margin-top: 18px;
    text-align: left;
  }
  .center {
    min-height: calc(100vh - 100px);
    display: grid;
    place-items: center;
    align-content: center;
    text-align: center;
    padding: 24px;
  }
  .intro {
    gap: 10px;
  }
  .soft {
    color: var(--dim);
    margin: 0;
  }
  .small {
    font-size: 14px;
  }
  .rating {
    font-size: 76px;
    font-weight: 900;
    line-height: 1;
  }
  .intro .label {
    margin-top: 14px;
  }
  .facts {
    display: flex;
    gap: 12px;
    margin: 20px 0 22px;
  }
  .fact {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 140px;
    padding: 14px 18px;
  }
  .fact b {
    font-size: 28px;
    font-weight: 900;
    line-height: 1.1;
  }
  .fact span {
    font-size: 14px;
    color: var(--dim);
  }
  .big {
    height: 54px;
    padding: 0 40px;
    font-size: 16px;
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 24px;
    max-width: 620px;
  }
  .pick {
    padding: 8px 15px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 800;
    color: var(--dim);
    border: 2px solid var(--line);
    border-bottom-width: 4px;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .pick:hover {
    color: var(--text);
    border-color: var(--line-2);
  }
  .pick.on {
    color: var(--accent);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  h2 {
    font-size: 38px;
    margin: 14px 0 0;
  }
  .up {
    color: var(--accent);
    font-weight: 900;
    margin-left: 6px;
  }
  .down {
    color: var(--red);
    font-weight: 900;
    margin-left: 6px;
  }
  .train {
    --board: min(calc(100vh - 190px), 660px, calc(100vw - 500px));
    display: grid;
    grid-template-columns: var(--board) 380px;
    grid-template-rows: auto auto;
    column-gap: 32px;
    row-gap: 18px;
    justify-content: center;
    padding: 22px 28px;
  }
  .progress-row {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .quit {
    color: var(--faint);
    display: grid;
    place-items: center;
    transition: color 0.15s;
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
    box-shadow: inset 0 -4px 0 var(--accent-d), inset 0 4px 0 rgb(255 255 255 / 0.22);
    transition: width 0.5s var(--spring);
  }
  .count {
    font-weight: 900;
    color: var(--dim);
  }
  .boardcell {
    width: var(--board);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .panel {
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    transition: background 0.2s, border-color 0.2s;
  }
  .panel.won {
    background: color-mix(in srgb, var(--accent) 12%, var(--panel));
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  }
  .panel.lost {
    background: color-mix(in srgb, var(--red) 10%, var(--panel));
    border-color: color-mix(in srgb, var(--red) 55%, transparent);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .prompt {
    font-size: 26px;
    font-weight: 900;
    line-height: 1.15;
    margin-bottom: 8px;
  }
  .won .prompt {
    color: var(--accent);
  }
  .lost .prompt {
    color: var(--red);
  }
  .context {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14.5px;
    color: var(--dim);
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  .actions > :global(*) {
    flex: 1;
  }
  .btn.danger {
    --fill: var(--red);
    --edge: var(--red-d);
    --ink: #fff;
  }
  .meta {
    padding-left: 4px;
  }
  @media (max-width: 1000px) {
    .train {
      --board: min(calc(100vw - 48px), 640px);
      grid-template-columns: 1fr;
    }
  }
</style>
