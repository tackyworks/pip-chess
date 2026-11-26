<script lang="ts">
  import { fly } from 'svelte/transition'
  import Pip from '../components/Pip.svelte'
  import Glyph from '../components/Glyph.svelte'
  import Footer from '../components/Footer.svelte'
  import MiniBoard from '../components/MiniBoard.svelte'
  import { api } from '../lib/api.ts'
  import { app, refresh } from '../lib/state.svelte.ts'
  import { FAQ, landingFor } from '../../../shared/site.ts'
  import type { Account } from '../../../shared/types.ts'

  const page = landingFor(location.pathname)

  let name = $state('')
  let site = $state<'chesscom' | 'lichess'>(page.path.includes('lichess') ? 'lichess' : 'chesscom')
  let busy = $state(false)
  let error = $state<string | null>(null)
  let recent = $state<Account[]>([])
  let field: HTMLInputElement | undefined = $state()

  void api.accounts().then(a => (recent = a))

  const SITES = { chesscom: 'chess.com', lichess: 'Lichess' } as const

  const enter = async (s: 'chesscom' | 'lichess', username: string) => {
    if (!username.trim() || busy) return
    busy = true
    error = null
    try {
      app.me = await api.signIn(s, username.trim())
      app.syncing = true
      await refresh()
    } catch (err) {
      error = (err as Error).message
    } finally {
      busy = false
    }
  }

  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    if (!name.trim()) return field?.focus()
    void enter(site, name)
  }

  const pick = (s: 'chesscom' | 'lichess') => {
    site = s
    field?.focus()
  }

  const HABITS = [
    { bad: true, title: 'Castling late', value: 'around move 14' },
    { bad: true, title: 'Missing their threats', value: 'most of your tactical errors' },
    { bad: false, title: 'Calm when ahead', value: 'few errors in winning positions' },
  ]
</script>

<div class="landing">
  <header class="top">
    <a class="brand" href="/"><Pip mood="idle" size={30} /><span>pip</span></a>
    <nav>
      <a href="#how">How it works</a>
      <a href="/about">About</a>
    </nav>
  </header>

  <section class="hero">
    <div class="intro" in:fly={{ y: 10, duration: 420 }}>
      <h1>{page.headline}</h1>
      <p class="lead">{page.lead}</p>

      <div class="sites" role="radiogroup" aria-label="Where you play">
        <span>I play on</span>
        {#each Object.entries(SITES) as [key, label]}
          <button type="button" role="radio" aria-checked={site === key} class:on={site === key} onclick={() => pick(key as 'chesscom' | 'lichess')}>{label}</button>
        {/each}
      </div>
      <form onsubmit={submit} class:error={!!error}>
        <input bind:this={field} bind:value={name} placeholder="Username" autocomplete="off" spellcheck="false" aria-label="{SITES[site]} username" />
        <button class="btn primary go" disabled={busy}>{busy ? 'Finding your games…' : 'Review my games'}</button>
      </form>

      {#if error}
        <p class="error" in:fly={{ y: 4 }}>{error}</p>
      {:else if recent.length}
        <p class="recent">
          Continue as
          {#each recent.slice(0, 3) as a, i}{#if i}, {/if}<button onclick={() => enter(a.site, a.username)}>{a.username}</button>{/each}
        </p>
      {:else}
        <p class="fine">Free and unlimited. No sign-up, only your public games.</p>
      {/if}
    </div>

    <figure class="shot" in:fly={{ y: 16, duration: 520, delay: 80 }}>
      <div class="shot-board">
        <MiniBoard fen="r1b1kbnr/pppp1Npp/8/6q1/2BnP3/8/PPPP1PPP/RNBQK2R b KQkq - 0 5" last="e5f7" size={340} />
        <span class="mark"><Glyph label="blunder" size={34} /></span>
      </div>
      <figcaption class="shot-side">
        <div class="score">
          <span><b class="num">64.2</b> you</span>
          <span><b class="num">88.9</b> opponent</span>
        </div>
        <div class="move">
          <Glyph label="blunder" size={24} />
          <b>5. Nxf7</b>
          <span>Blunder</span>
        </div>
        <p>Grabbing the rook looks free, but the real target was your g2 pawn. After 5…Qxg2 the rook on h1 falls and mate on f3 follows.</p>
        <div class="best"><Glyph label="best" size={20} />Best was <b>5. O-O</b></div>
        <div class="coach"><Pip mood="worried" size={34} />Before taking anything, ask what their queen attacks.</div>
      </figcaption>
    </figure>
  </section>

  <section class="row" id="how">
    <div class="copy">
      <h2>It notices what keeps happening</h2>
      <p>After a handful of games Pip sees your patterns: the king left in the center, the move you rush in a sharp position, the fork you walk into again. Then it tells you what to change.</p>
    </div>
    <div class="habits">
      {#each HABITS as h}
        <div class="habit">
          <span class="dot" class:bad={h.bad}></span>
          <b>{h.title}</b>
          <span>{h.value}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="row flip">
    <div class="copy">
      <h2>Your mistakes come back as puzzles</h2>
      <p>The position you got wrong returns a few days later, right before you would forget it. In between, Pip mixes in puzzles on the tactics you miss most.</p>
    </div>
    <figure class="puzzle">
      <MiniBoard fen="r1b1kbnr/pppp1Npp/8/8/2BnP3/8/PPPP1PqP/RNBQKR2 b Qkq - 1 6" orientation="black" size={260} />
      <figcaption><b>Black to play and win</b><span>From the same game, one move later</span></figcaption>
    </figure>
  </section>

  <section class="row">
    <div class="copy">
      <h2>An opening repertoire built from your games</h2>
      <p>Pip maps the openings you actually play, finds the exact move where you tend to go wrong, and drills the fix until it sticks.</p>
    </div>
    <div class="line">
      <span>1. e4 e5</span>
      <span>2. Nf3 Nc6</span>
      <span>3. Bc4 Nd4</span>
      <span class="slip"><Glyph label="inaccuracy" size={20} />4. Nxe5</span>
      <p>Your usual move walks into the trap’s main line. <b>4. Nxd4</b> keeps a clear edge.</p>
    </div>
  </section>

  <section class="faq">
    <h2>Questions</h2>
    <div class="qa">
      {#each FAQ as [q, a]}
        <details>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      {/each}
    </div>
  </section>

  <section class="closing">
    <h2>Your last game is waiting.</h2>
    <button class="btn primary" onclick={() => { scrollTo({ top: 0, behavior: 'smooth' }); field?.focus() }}>Review it free</button>
  </section>

  <Footer />
</div>

<style>
  .landing {
    min-height: 100vh;
  }
  .top {
    width: min(1160px, 100%);
    margin: 0 auto;
    padding: 18px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--accent);
    text-decoration: none;
    font: 700 27px var(--display);
  }
  .top nav {
    display: flex;
    gap: 22px;
  }
  .top nav a {
    color: var(--dim);
    text-decoration: none;
    font-weight: 700;
  }
  .top nav a:hover {
    color: var(--text);
  }

  .hero {
    width: min(1160px, 100%);
    margin: 0 auto;
    padding: 56px 24px 90px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 56px;
    align-items: center;
  }
  h1 {
    margin: 0 0 18px;
    font-size: clamp(40px, 5.2vw, 64px);
    line-height: 1.02;
    letter-spacing: -0.02em;
    max-width: 560px;
  }
  .lead {
    margin: 0 0 30px;
    max-width: 500px;
    font-size: 19px;
    line-height: 1.55;
    color: var(--dim);
  }
  form {
    display: flex;
    gap: 10px;
    max-width: 540px;
  }
  .sites {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 10px;
    font-size: 15px;
    color: var(--faint);
    font-weight: 700;
  }
  .sites span {
    margin-right: 4px;
  }
  .sites button {
    padding: 4px 10px;
    border-radius: 8px;
    font-weight: 800;
    color: var(--dim);
    transition: background 0.15s, color 0.15s;
  }
  .sites button:hover {
    color: var(--text);
  }
  .sites button.on {
    color: var(--accent-ink);
    background: var(--accent);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 54px;
    padding: 0 16px;
    border-radius: 14px;
    background: var(--panel);
    border: 1px solid var(--line-2);
    outline: 0;
    font-size: 17px;
    font-weight: 700;
    transition: border-color 0.15s;
  }
  input:focus {
    border-color: var(--accent);
  }
  form.error input {
    border-color: var(--red);
  }
  input::placeholder {
    color: var(--faint);
  }
  .go {
    height: 54px;
    padding: 0 22px;
    font-size: 16px;
    border-radius: 14px;
  }
  .fine,
  .recent,
  .error {
    margin: 14px 0 0;
    font-size: 15px;
    color: var(--faint);
  }
  .recent button {
    color: var(--accent);
    font-weight: 800;
  }
  .recent button:hover {
    text-decoration: underline;
  }
  .error {
    color: var(--red);
    font-weight: 700;
  }

  .shot {
    margin: 0;
    display: flex;
    border-radius: 20px;
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: 0 40px 80px -40px rgb(0 0 0 / 0.9);
    overflow: hidden;
  }
  .shot-board {
    position: relative;
    padding: 14px;
    background: var(--bg-2);
  }
  .shot-board :global(.mini) {
    border-radius: 8px;
  }
  .mark {
    position: absolute;
    left: calc(14px + 340px * 6 / 8 - 18px);
    top: calc(14px + 340px / 8 - 16px);
  }
  .shot-side {
    width: 268px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-size: 14.5px;
  }
  .score {
    display: flex;
    gap: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--line);
    color: var(--faint);
    font-weight: 700;
  }
  .score b {
    display: block;
    font: 600 26px var(--display);
    color: var(--text);
  }
  .move {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .move b {
    font-size: 17px;
  }
  .move span {
    color: var(--c-blunder);
    font-weight: 800;
  }
  .shot-side p {
    margin: 0;
    color: var(--dim);
    line-height: 1.55;
  }
  .best {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--dim);
    font-weight: 700;
  }
  .best b {
    color: var(--text);
  }
  .coach {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--panel-2);
    color: var(--text);
    font-weight: 700;
    line-height: 1.35;
  }

  .row {
    width: min(1000px, 100%);
    margin: 0 auto;
    padding: 70px 24px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    align-items: center;
    border-top: 1px solid var(--line);
  }
  .row.flip .copy {
    order: 2;
  }
  .copy h2,
  .faq h2,
  .closing h2 {
    margin: 0 0 12px;
    font-size: 30px;
    line-height: 1.12;
    letter-spacing: -0.01em;
  }
  .copy p {
    margin: 0;
    color: var(--dim);
    font-size: 17px;
    line-height: 1.6;
  }
  .habits {
    display: flex;
    flex-direction: column;
  }
  .habit {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 14px;
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  .habit:last-child {
    border-bottom: 0;
  }
  .dot {
    grid-row: span 2;
    width: 10px;
    height: 10px;
    margin-top: 7px;
    border-radius: 50%;
    background: var(--c-best);
  }
  .dot.bad {
    background: var(--orange);
  }
  .habit b {
    font-size: 17px;
  }
  .habit span:last-child {
    color: var(--dim);
  }
  .puzzle {
    margin: 0;
    justify-self: center;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .puzzle figcaption {
    display: flex;
    flex-direction: column;
  }
  .puzzle figcaption span {
    color: var(--faint);
    font-size: 14px;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    align-items: center;
    font-size: 18px;
    font-weight: 800;
  }
  .line > span {
    color: var(--dim);
  }
  .line .slip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--c-inaccuracy);
  }
  .line p {
    flex-basis: 100%;
    margin: 6px 0 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--dim);
    line-height: 1.55;
  }
  .line p b {
    color: var(--text);
  }

  .faq {
    width: min(760px, 100%);
    margin: 0 auto;
    padding: 70px 24px 30px;
    border-top: 1px solid var(--line);
  }
  .qa details {
    border-bottom: 1px solid var(--line);
  }
  .qa summary {
    list-style: none;
    padding: 18px 0;
    font-size: 17px;
    font-weight: 800;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  .qa summary::-webkit-details-marker {
    display: none;
  }
  .qa summary::after {
    content: '+';
    color: var(--faint);
    font-weight: 600;
    font-size: 22px;
    line-height: 1;
    transition: rotate 0.2s;
  }
  .qa details[open] summary::after {
    rotate: 45deg;
  }
  .qa p {
    margin: -6px 0 18px;
    color: var(--dim);
    line-height: 1.6;
  }
  .closing {
    padding: 60px 24px 20px;
    text-align: center;
  }
  .closing .btn {
    height: 50px;
    padding: 0 26px;
    margin-top: 6px;
  }

  @media (max-width: 980px) {
    .hero {
      grid-template-columns: 1fr;
      padding-top: 30px;
    }
    .shot {
      justify-self: center;
    }
  }
  @media (max-width: 760px) {
    .shot {
      flex-direction: column;
      width: 100%;
    }
    .shot-board {
      display: flex;
      justify-content: center;
    }
    .shot-side {
      width: auto;
    }
    .mark {
      display: none;
    }
    .row {
      grid-template-columns: 1fr;
      gap: 28px;
      padding: 50px 24px;
    }
    .row.flip .copy {
      order: 0;
    }
  }
  @media (max-width: 560px) {
    form {
      flex-direction: column;
    }
    input,
    .go {
      flex: none;
      width: 100%;
    }
    .shot-board :global(.mini) {
      width: 100%;
      height: auto;
    }
  }
</style>
