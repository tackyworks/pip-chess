<script module lang="ts">
  const counted = new Set<string>()
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import Board, { type Arrow } from '../components/Board.svelte'
  import EvalBar from '../components/EvalBar.svelte'
  import Graph from '../components/Graph.svelte'
  import Moves from '../components/Moves.svelte'
  import Pip from '../components/Pip.svelte'
  import Glyph from '../components/Glyph.svelte'
  import Count from '../components/Count.svelte'
  import Sponsor from '../components/Sponsor.svelte'
  import ShareSheet from '../components/ShareSheet.svelte'
  import Avatar from '../components/Avatar.svelte'
  import CoachNotes from '../components/CoachNotes.svelte'
  import { api, type EvalLine } from '../lib/api.ts'
  import { app } from '../lib/state.svelte.ts'
  import { ERRORS, LABELS } from '../lib/labels.ts'
  import { play, turnOf } from '../lib/chess.ts'
  import { clock, evalText, moveNo, outcome } from '../lib/format.ts'
  import { sfx } from '../lib/sound.ts'
  import { href } from '../lib/router.svelte.ts'
  import { share } from '../lib/share.ts'
  import { toast } from '../lib/toast.svelte.ts'
  import type { Color, GameDetail, Label, Mood, Ply } from '../../../shared/types.ts'

  let { id, shared = null }: { id: string; shared?: GameDetail | null } = $props()

  type Mode =
    | { kind: 'review' }
    | { kind: 'retry'; tries: number; solved: boolean | null; fen: string; last: string | null; busy: boolean }
    | { kind: 'explore'; fen: string; last: string; sans: string[]; lines: EvalLine[] | null }
    | { kind: 'spar'; fen: string; last: string | null; you: Color; elo: number; thinking: boolean; over: string | null }

  const STAGES = { quick: 'Taking a first look', scan: 'Reading every move', verify: 'Double-checking the critical moments', human: 'Asking the human model', coach: 'Writing your notes' }
  const TALLY: Label[] = ['brilliant', 'great', 'best', 'inaccuracy', 'mistake', 'miss', 'blunder']

  let detail = $state<GameDetail | null>(null)
  let failed = $state<string | null>(null)
  let ply = $state(0)
  let flipped = $state(false)
  let mode = $state<Mode>({ kind: 'review' })
  let shake = $state(0)
  let showLine = $state(false)
  let showNotes = $state(false)
  let evalToken = 0

  let sharing = $state(false)
  let sheet = $state<{ link: string; title: string } | null>(null)

  const shareGame = async () => {
    if (!detail || sharing) return
    sharing = true
    try {
      const link = await share(detail)
      const title = `${detail.game.white.name} vs ${detail.game.black.name}`
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title, url: link }).catch(() => undefined)
      else sheet = { link, title }
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      sharing = false
    }
  }

  const load = async () => {
    if (shared) return void (detail = shared)
    try {
      const next = await api.game(id)
      detail = next
      if (!next.review) {
        app.wanted.add(id)
        await api.analyze(id)
      }
    } catch (e) {
      failed = (e as Error).message
    }
  }

  $effect(() => {
    void id
    untrack(() => {
      detail = null
      ply = 0
      mode = { kind: 'review' }
      void load()
    })
  })

  $effect(() => {
    if (app.reviewed[id] && !shared) untrack(() => void api.game(id).then(d => (detail = d)))
  })

  const game = $derived(detail?.game ?? null)
  const review = $derived(detail?.review ?? null)
  const moves = $derived(detail?.line.moves ?? [])
  const plies = $derived(review?.plies ?? [])
  const you = $derived(game?.you ?? null)
  const orientation = $derived<Color>((you === 'black') !== flipped ? 'black' : 'white')
  const current = $derived<Ply | null>(ply > 0 ? plies[ply - 1] ?? null : null)
  const fenAt = (p: number) => (p === 0 ? detail!.line.start : moves[p - 1].fen)
  const points = $derived(
    review ? [review.origin, ...plies.map(p => p.white)] : Array.from({ length: moves.length + 1 }, (_, i) => app.live[id]?.[i] ?? null),
  )
  const progress = $derived(app.progress[id])
  const isError = $derived(!!current && ERRORS.includes(current.label))
  const mine = $derived(!!current && (you === null || current.color === you))
  const moverEp = (p: Ply) => (p.color === 'white' ? p.white : 1 - p.white)

  const board = $derived.by(() => {
    if (!detail) return null
    if (mode.kind === 'retry') {
      const arrows: Arrow[] = mode.solved === false && current?.best ? [{ uci: current.best.uci, brush: 'best' }] : []
      return { fen: mode.fen, last: mode.last, movable: mode.solved === null && !mode.busy ? current!.color : null, arrows, badge: null }
    }
    if (mode.kind === 'explore') {
      const top = mode.lines?.[0]
      return { fen: mode.fen, last: mode.last, movable: 'turn' as const, arrows: top ? [{ uci: top.uci, brush: 'line' as const }] : [], badge: null }
    }
    if (mode.kind === 'spar') {
      return { fen: mode.fen, last: mode.last, movable: mode.thinking || mode.over ? null : mode.you, arrows: [], badge: null }
    }
    const arrows: Arrow[] = []
    if (current && isError && current.best) arrows.push({ uci: current.best.uci, brush: 'best' })
    if (current && current.cause === 'allowed' && current.reply) arrows.push({ uci: current.reply.uci, brush: 'threat' })
    return {
      fen: fenAt(ply),
      last: moves[ply - 1]?.uci ?? null,
      movable: 'turn' as const,
      arrows,
      badge: current && current.label !== 'good' ? { square: current.uci.slice(2, 4), label: current.label } : null,
    }
  })

  const evalNow = $derived.by(() => {
    if (mode.kind === 'explore' && mode.lines?.[0]) return { white: mode.lines[0].white, text: evalText(mode.lines[0].cp, mode.lines[0].mate) }
    const p = mode.kind === 'retry' ? plies[ply - 2] : current
    if (p) return { white: p.white, text: evalText(p.cp, p.mate) }
    return { white: points[0] ?? 0.5, text: '' }
  })

  const mood = $derived.by((): Mood => {
    if (!review) return 'think'
    if (mode.kind === 'retry') return mode.solved === true ? 'cheer' : mode.solved === false ? 'sad' : mode.tries ? 'oops' : 'think'
    if (mode.kind === 'explore') return mode.lines ? 'idle' : 'think'
    if (mode.kind === 'spar') return mode.thinking ? 'think' : mode.over ? 'happy' : 'idle'
    if (!current) return 'happy'
    const m = LABELS[current.label].mood
    return !mine && ERRORS.includes(current.label) ? 'happy' : m
  })

  const clockOf = (color: Color) => {
    if (game?.timeClass === 'daily') return null
    for (let p = ply; p >= 1; p--) if (moves[p - 1] && turnOf(fenAt(p - 1)) === color) return moves[p - 1].clock
    return null
  }

  $effect(() => {
    if (ply > 0 && review && !shared && !counted.has(id)) {
      counted.add(id)
      void api.activity()
    }
  })

  const goto = (p: number) => {
    mode = { kind: 'review' }
    showLine = false
    ply = Math.max(0, Math.min(moves.length, p))
  }

  const moment = (dir: 1 | -1) => {
    const list = review?.moments ?? []
    const target = dir > 0 ? list.find(m => m.ply > ply) : [...list].reverse().find(m => m.ply < ply)
    if (target) goto(target.ply)
    else if (dir > 0 && ply === 0) goto(1)
  }

  const evaluate = async (fen: string) => {
    const token = ++evalToken
    const { lines } = await api.evaluate(fen)
    if (token === evalToken && mode.kind === 'explore') mode.lines = lines
  }

  const startRetry = () => {
    if (!current?.best) return
    mode = { kind: 'retry', tries: 0, solved: null, fen: fenAt(ply - 1), last: moves[ply - 2]?.uci ?? null, busy: false }
  }

  const retryMove = async (uci: string) => {
    if (mode.kind !== 'retry' || !current?.best) return
    const target = current
    const before = fenAt(ply - 1)
    const result = play(before, uci)
    if (!result) return
    mode.fen = result.fen
    mode.last = uci
    mode.busy = true
    let solved = uci === target.best!.uci
    if (!solved && !result.end) {
      const { lines } = await api.evaluate(result.fen)
      const ep = lines.length ? (target.color === 'white' ? lines[0].white : 1 - lines[0].white) : 0.5
      solved = ep >= moverEp(target) + target.loss - 0.03
    } else if (!solved && result.mate) solved = true
    if (mode.kind !== 'retry') return
    mode.busy = false
    if (solved) {
      mode.solved = true
      sfx.great()
      return
    }
    mode.tries++
    shake++
    sfx.bad()
    const tries = mode.tries
    setTimeout(() => {
      if (mode.kind !== 'retry') return
      mode.fen = before
      mode.last = moves[ply - 2]?.uci ?? null
      if (tries >= 2) mode.solved = false
    }, 560)
  }

  const exploreMove = (uci: string) => {
    const base = mode.kind === 'explore' ? mode.fen : fenAt(ply)
    const result = play(base, uci)
    if (!result) return
    const sans = mode.kind === 'explore' ? [...mode.sans, result.san] : [result.san]
    mode = { kind: 'explore', fen: result.fen, last: uci, sans, lines: null }
    void evaluate(result.fen)
  }

  const startSpar = () => {
    if (!game) return
    const fen = mode.kind === 'explore' ? mode.fen : fenAt(ply)
    const side = turnOf(fen)
    const rival = side === 'white' ? game.black.rating : game.white.rating
    mode = { kind: 'spar', fen, last: null, you: side, elo: Math.max(800, rival || 1500), thinking: false, over: null }
  }

  const sparMove = async (uci: string) => {
    if (mode.kind !== 'spar') return
    const result = play(mode.fen, uci)
    if (!result) return
    mode.fen = result.fen
    mode.last = uci
    if (result.end) return void (mode.over = result.mate ? 'You won the position.' : 'Drawn.')
    mode.thinking = true
    const [{ uci: reply }] = await Promise.all([api.spar(result.fen, mode.elo, 'maia'), new Promise(r => setTimeout(r, 420))])
    if (mode.kind !== 'spar' || !reply) return
    const answer = play(mode.fen, reply)
    if (!answer) return
    mode.fen = answer.fen
    mode.last = reply
    mode.thinking = false
    if (answer.end) mode.over = answer.mate ? 'Maia found the mate.' : 'Drawn.'
  }

  const onmove = (uci: string) => {
    if (mode.kind === 'retry') return void retryMove(uci)
    if (mode.kind === 'spar') return void sparMove(uci)
    exploreMove(uci)
  }

  const keys = (e: KeyboardEvent) => {
    if (!detail || (e.target as HTMLElement)?.closest('input, textarea')) return
    const map: Record<string, () => void> = {
      ArrowRight: () => goto(ply + 1),
      ArrowLeft: () => (mode.kind === 'review' ? goto(ply - 1) : goto(ply)),
      ArrowDown: () => moment(1),
      ArrowUp: () => moment(-1),
      Home: () => goto(0),
      End: () => goto(moves.length),
      Escape: () => (showNotes ? (showNotes = false) : goto(ply)),
      f: () => (flipped = !flipped),
      r: () => isError && mine && startRetry(),
    }
    const action = map[e.key]
    if (action) {
      e.preventDefault()
      action()
    }
  }

  const result = $derived(game ? outcome(game) : null)
  const notesMood = $derived<Mood>(result === 'win' ? 'proud' : result === 'loss' ? 'hmm' : 'ok')
  const RESULT = { win: 'Won', loss: 'Lost', draw: 'Drawn' }
</script>

<svelte:window onkeydown={keys} />

{#if failed}
  <div class="empty">
    <Pip mood="sad" size={90} />
    <p>{failed}</p>
    <a class="btn" href={href('/')}>Back to games</a>
  </div>
{:else if detail && game && board}
  <div class="review">
    <div class="stage">
      {#snippet strip(color: Color)}
        {@const player = game![color]}
        {@const time = clockOf(color)}
        <div class="strip">
          <Avatar name={player.name} size={36} mascot={game!.timeClass === 'pip' && player.name === 'Pip'} />
          <span class="name">{player.name}</span>
          <span class="faint num">{player.rating || ''}</span>
          {#if you === color && !shared}<span class="chip you">You</span>{/if}
          <span class="grow"></span>
          {#if time !== null}<span class="clock num" class:low={turnOf(board!.fen) === color}>{clock(time)}</span>{/if}
        </div>
      {/snippet}

      <div class="topline">{@render strip(orientation === 'white' ? 'black' : 'white')}</div>
      <div class="bar"><EvalBar white={evalNow.white} text={evalNow.text} {orientation} pending={!review} /></div>
      <div class="boardcell">
        <Board fen={board.fen} last={board.last} {orientation} movable={board.movable} arrows={board.arrows} badge={board.badge} {shake} {onmove} />
      </div>
      <div class="bottomline">{@render strip(orientation)}</div>
      <div class="graphcell">
        <Graph {points} current={mode.kind === 'review' ? ply : -1} moments={review?.moments ?? []} {orientation} onseek={goto} />
      </div>
    </div>

    <aside class="side">
      <header class="title">
        <a href={href('/')} class="back" aria-label="Back to games">
          <svg viewBox="0 0 20 20" width="20" height="20"><path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </a>
        <div class="titletext">
          <div class="opening">{review?.opening?.name ?? game.opening ?? 'Game review'}</div>
          <div class="sub"><span class="tc">{game.timeClass}</span> · {new Date(game.endTime * 1000).toLocaleDateString()}{result ? ` · ${RESULT[result]}` : ` · ${game.result}`}</div>
        </div>
        {#if review && !review.draft && !shared}
          <button class="btn icon flip" onclick={shareGame} disabled={sharing} aria-label="Share review" title="Share review">
            <svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 12.5V3.5m0 0L6.5 7M10 3.5L13.5 7M5 10.5v4.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5v-4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        {/if}
        <button class="btn icon flip" onclick={() => (flipped = !flipped)} aria-label="Flip board" title="Flip (F)">
          <svg viewBox="0 0 20 20" width="20" height="20"><path d="M6 3.5v12m0 0l-2.5-2.5M6 15.5l2.5-2.5M14 16.5v-12m0 0l-2.5 2.5M14 4.5l2.5 2.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </header>

      {#if review?.draft}
        <div class="draft">
          <div class="draft-text"><b>First look</b><span>{progress?.stage === 'verify' ? 'Double-checking the critical moments…' : 'Pip is taking a deeper look…'}</span></div>
          <div class="draft-meter"><span style="width: {progress && progress.total > 1 ? (progress.done / progress.total) * 100 : 4}%"></span></div>
        </div>
      {/if}

      <section class="coach card">
        {#if !review}
          <div class="head">
            <Pip mood="think" size={72} />
            <div>
              <div class="kicker">{game.status === 'queued' ? 'Waiting in line' : game.status === 'error' ? 'Something went wrong' : 'Analyzing'}</div>
              <div class="headline">{progress ? STAGES[progress.stage] : game.status === 'error' ? 'Analysis failed' : 'Getting ready'}</div>
            </div>
          </div>
          {#if progress && progress.total > 1}
            <div class="meter"><span style="width: {(progress.done / progress.total) * 100}%"></span></div>
          {/if}
          {#if game.status === 'error'}
            <button class="btn" onclick={() => api.analyze(id)}>Try again</button>
          {:else}
            <p class="soft">You can step through the moves while I work.</p>
          {/if}
        {:else if mode.kind === 'retry'}
          <div class="head">
            <Pip {mood} size={72} />
            <div>
              <div class="kicker">Retry · move {Math.ceil(current!.ply / 2)}</div>
              <div class="headline">
                {#if mode.solved === true}Found it!{:else if mode.solved === false}The move was {current!.best!.san}.{:else if mode.busy}Checking…{:else if mode.tries}Not quite. One more try.{:else}Find a better move than {current!.san}.{/if}
              </div>
            </div>
          </div>
          {#if mode.solved !== null}
            <p class="line-text num" in:fly={{ y: 6 }}>{current!.best!.line.join(' ')}</p>
            {#if current!.tip}<div class="lesson" in:fly={{ y: 6, delay: 80 }}><span class="label">Lesson</span><p>{current!.tip}</p></div>{/if}
          {/if}
          <div class="actions">
            {#if mode.solved !== null}<button class="btn primary" onclick={() => moment(1)}>Next moment</button>{/if}
            <button class="btn ghost" onclick={() => goto(ply)}>Back</button>
          </div>
        {:else if mode.kind === 'explore'}
          <div class="head">
            <Pip {mood} size={72} />
            <div>
              <div class="kicker">Exploring</div>
              <div class="headline num">{mode.sans.slice(-4).join(' ')}</div>
            </div>
          </div>
          <div class="lines">
            {#if mode.lines}
              {#each mode.lines as l (l.uci)}
                <div class="engine-line">
                  <span class="score num" class:black={l.white < 0.5}>{l.white >= 0.5 ? '+' : '−'}{evalText(l.cp, l.mate)}</span>
                  <span class="num">{l.line.join(' ')}</span>
                </div>
              {/each}
            {:else}
              <p class="soft">Looking at the position…</p>
            {/if}
          </div>
          <div class="actions">
            <button class="btn" onclick={() => goto(ply)}>Back to game</button>
            <button class="btn ghost" onclick={startSpar}>Play from here</button>
          </div>
        {:else if mode.kind === 'spar'}
          <div class="head">
            <Pip {mood} size={72} />
            <div>
              <div class="kicker">Playing it out · Maia {mode.elo}</div>
              <div class="headline">{mode.over ?? (mode.thinking ? 'Maia is thinking…' : 'Your move.')}</div>
            </div>
          </div>
          <p class="soft">Maia plays like a human at this rating, mistakes included.</p>
          <div class="actions">
            <button class="btn" onclick={() => goto(ply)}>Stop</button>
          </div>
        {:else if ply === 0}
          <div class="summary">
            <div class="players">
              {#each ['white', 'black'] as const as color}
                {@const side = review[color]}
                <div class="player" class:me={you === color}>
                  <div class="who"><Avatar name={game[color].name} size={28} mascot={game.timeClass === 'pip' && game[color].name === 'Pip'} /><span>{game[color].name}</span></div>
                  <div class="acc num"><Count value={side.accuracy} decimals={1} /></div>
                  <div class="soft small">accuracy{side.perf ? ` · played like ${side.perf}` : ''}</div>
                </div>
              {/each}
            </div>
            <div class="tally">
              {#each TALLY as label}
                {@const w = review.white.counts[label] ?? 0}
                {@const b = review.black.counts[label] ?? 0}
                {#if w || b || label === 'best'}
                  <div class="tally-row">
                    <span class="num" class:zero={!w}>{w}</span>
                    <span class="tally-name"><Glyph {label} size={22} />{LABELS[label].name}</span>
                    <span class="num" class:zero={!b}>{b}</span>
                  </div>
                {/if}
              {/each}
            </div>
            {#if review.notes}
              <p class="story">{review.notes.story}</p>
            {:else if review.takeaways.length}
              <p class="story">{review.takeaways[0]}</p>
            {/if}
            <div class="actions wide">
              {#if review.notes}<button class="btn ivory" onclick={() => (showNotes = true)}>Coach's notes</button>{/if}
              <button class="btn primary" onclick={() => moment(1)}>Start review</button>
            </div>
          </div>
        {:else if current}
          {@const meta = LABELS[current.label]}
          <div class="head">
            <Pip {mood} size={72} />
            {#key current.ply}
              <div in:fly={{ y: 6, duration: 180 }}>
                <div class="kicker tag" style="--c: var(--c-{current.label})">
                  <Glyph label={current.label} size={22} />{meta.name}
                </div>
                <div class="headline">{moveNo(current.ply, current.color)} {current.san}</div>
              </div>
            {/key}
          </div>
          {#if current.note}<p class="note">{current.note}</p>{/if}
          {#if isError && current.best}
            <button class="best" onclick={() => (showLine = !showLine)}>
              <span class="best-label">Best</span>
              <b class="num">{current.best.san}</b>
              {#if showLine}<span class="num soft">{current.best.line.slice(1, 7).join(' ')}</span>{:else}<span class="more">Show line</span>{/if}
            </button>
          {/if}
          {#if mine && isError && current.chance}
            <p class="soft small">
              {current.chance.ease >= 0.5 ? `Most players at your level find ${current.best?.san ?? 'this'}.` : `Only ${Math.max(1, Math.round(current.chance.ease * 100))}% of players at your level find this.`}
              {#if current.spent !== null && current.spent < 4}You spent {Math.max(1, Math.round(current.spent))}s.{/if}
            </p>
          {/if}
          {#if current.tip && mine}
            <div class="lesson">
              <span class="label">Lesson</span>
              <p>{current.tip}</p>
            </div>
          {/if}
          <div class="actions">
            {#if isError && mine && current.best}<button class="btn primary" onclick={startRetry}>Retry</button>{/if}
            <button class="btn ghost" onclick={startSpar}>Play from here</button>
          </div>
        {/if}
      </section>

      <section class="movelist card">
        <Moves moves={moves.map((m, i) => ({ san: m.san, label: plies[i]?.label }))} current={mode.kind === 'review' ? ply : -1} blackFirst={detail.line.start.split(' ')[1] === 'b'} onselect={goto} />
      </section>

      <nav class="controls">
        <button class="btn icon" onclick={() => goto(0)} aria-label="Start" title="Start (Home)"><svg viewBox="0 0 20 20" width="20"><path d="M5 4.5v11M15 4.5L8.5 10l6.5 5.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        <button class="btn icon" onclick={() => goto(ply - 1)} aria-label="Previous" title="Previous (←)"><svg viewBox="0 0 20 20" width="20"><path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        <button class="btn ivory moment" onclick={() => moment(1)} disabled={!review?.moments.length} title="Next key moment (↓)">Key moment</button>
        <button class="btn icon" onclick={() => goto(ply + 1)} aria-label="Next" title="Next (→)"><svg viewBox="0 0 20 20" width="20"><path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        <button class="btn icon" onclick={() => goto(moves.length)} aria-label="End" title="End (End)"><svg viewBox="0 0 20 20" width="20"><path d="M15 4.5v11M5 4.5l6.5 5.5L5 15.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
      </nav>
    </aside>
  </div>
  {#if review && !review.draft}
    <div class="below">
      {#if shared}
        <a class="invite card" href="/">
          <Pip mood="cheer" size={64} />
          <span><b>Get reviews like this for your own games.</b><span>Free and unlimited for chess.com and Lichess. No sign-up.</span></span>
          <span class="btn primary">Try Pip</span>
        </a>
      {/if}
      <Sponsor placement="review" />
    </div>
  {/if}
  {#if sheet}<ShareSheet link={sheet.link} title={sheet.title} onclose={() => (sheet = null)} />{/if}
  {#if showNotes && review?.notes}
    <CoachNotes notes={review.notes} mood={notesMood} onclose={() => (showNotes = false)} />
  {/if}
{:else}
  <div class="empty"><Pip mood="think" size={72} /></div>
{/if}

<style>
  .review {
    --board: min(calc(100vh - 300px), 640px, calc(100vw - 540px));
    display: grid;
    grid-template-columns: auto minmax(340px, 410px);
    gap: 32px;
    justify-content: center;
    padding: 16px 28px 20px;
  }
  .stage {
    display: grid;
    grid-template-columns: 16px var(--board);
    column-gap: 12px;
    row-gap: 8px;
  }
  .topline,
  .bottomline,
  .graphcell {
    grid-column: 2;
  }
  .bar {
    grid-column: 1;
    grid-row: 2;
  }
  .boardcell {
    grid-column: 2;
    grid-row: 2;
    width: var(--board);
  }
  .graphcell {
    margin-top: 6px;
  }
  .strip {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 40px;
    font-weight: 800;
    font-size: 16px;
  }
  .strip .grow {
    flex: 1;
  }
  .clock {
    background: var(--panel);
    border: 2px solid var(--line);
    padding: 3px 12px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 800;
  }
  .clock.low {
    background: var(--panel-2);
    border-color: var(--line-2);
  }
  .chip.you {
    height: 24px;
    font-size: 12px;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: calc(var(--board) + 178px);
    min-height: 0;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .titletext {
    flex: 1;
    min-width: 0;
  }
  .opening {
    font-weight: 900;
    font-size: 17px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-size: 14px;
    color: var(--faint);
  }
  .tc {
    text-transform: capitalize;
  }
  .back {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: var(--dim);
    transition: background 0.15s, color 0.15s;
  }
  .back:hover {
    background: var(--panel);
    color: var(--text);
  }
  .flip {
    color: var(--dim);
  }
  .small {
    font-size: 14px;
  }
  .soft {
    color: var(--dim);
    margin: 0;
  }
  .coach {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: none;
    max-height: calc(var(--board) - 40px);
    overflow-y: auto;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .kicker {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .kicker.tag {
    color: var(--c);
  }
  .headline {
    font-size: 24px;
    font-weight: 900;
    line-height: 1.2;
    margin-top: 4px;
  }
  .note {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.5;
  }
  .best {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;
    padding: 11px 14px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--c-best) 10%, transparent);
    border: 2px solid color-mix(in srgb, var(--c-best) 40%, transparent);
    text-align: left;
    font-size: 16px;
    transition: background 0.15s;
  }
  .best:hover {
    background: color-mix(in srgb, var(--c-best) 16%, transparent);
  }
  .best-label {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--c-best);
  }
  .best b {
    font-size: 17px;
    font-weight: 900;
  }
  .more {
    margin-left: auto;
    font-size: 13px;
    font-weight: 800;
    color: var(--c-best);
  }
  .lesson {
    padding: 12px 14px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--accent) 9%, transparent);
    border: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .lesson .label {
    color: var(--accent);
  }
  .lesson p {
    margin: 4px 0 0;
    font-size: 15.5px;
    line-height: 1.45;
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  .actions.wide > :global(*) {
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
    background: var(--accent);
    border-radius: 14px;
    transition: width 0.4s var(--ease);
  }
  .line-text {
    margin: 0;
    color: var(--dim);
    font-size: 15.5px;
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .engine-line {
    display: flex;
    gap: 12px;
    font-size: 15px;
    color: var(--dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .score {
    flex: none;
    color: #1a1714;
    background: #f4f1ea;
    font-weight: 900;
    min-width: 52px;
    text-align: center;
    border-radius: 8px;
  }
  .score.black {
    color: #f4f1ea;
    background: #050505;
  }
  .summary {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .players {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .player {
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--bg);
    border: 2px solid var(--line);
  }
  .player.me {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 14.5px;
    white-space: nowrap;
    overflow: hidden;
  }
  .who span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .acc {
    font-size: 40px;
    font-weight: 900;
    line-height: 1.1;
    margin-top: 6px;
  }
  .tally {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tally-row {
    display: grid;
    grid-template-columns: 34px 1fr 34px;
    align-items: center;
    font-size: 16px;
    font-weight: 800;
  }
  .tally-row .num:last-child {
    text-align: right;
  }
  .tally-name {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--dim);
  }
  .zero {
    color: var(--faint);
  }
  .story {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.5;
    color: var(--text);
  }
  .movelist {
    flex: 1;
    min-height: 120px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .movelist :global(.moves) {
    flex: 1;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .controls .icon {
    color: var(--dim);
  }
  .moment {
    flex: 1;
  }
  .empty {
    min-height: 70vh;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 16px;
  }
  @media (max-width: 1000px) {
    .review {
      --board: min(calc(100vw - 80px), 640px);
      grid-template-columns: 1fr;
    }
    .side {
      height: auto;
    }
    .coach {
      max-height: none;
    }
    .movelist {
      max-height: 280px;
    }
  }
  .draft {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    border-radius: var(--radius);
    border: 2px dashed color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .draft-text {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 14.5px;
  }
  .draft-text b {
    color: var(--accent);
  }
  .draft-text span {
    color: var(--dim);
  }
  .draft-meter {
    height: 6px;
    border-radius: 6px;
    background: var(--line);
    overflow: hidden;
  }
  .draft-meter span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.4s var(--ease);
  }
  .below {
    width: min(1280px, 100%);
    margin: 0 auto;
    padding: 0 24px 40px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .invite {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 18px 22px;
    color: inherit;
    text-decoration: none;
  }
  .invite > span:nth-child(2) {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .invite b {
    font-size: 19px;
  }
  .invite span span {
    color: var(--dim);
  }
</style>
