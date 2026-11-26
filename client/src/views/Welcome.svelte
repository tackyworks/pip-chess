<script lang="ts">
  import { fly } from 'svelte/transition'
  import Pip from '../components/Pip.svelte'
  import Glyph from '../components/Glyph.svelte'
  import Footer from '../components/Footer.svelte'
  import MiniBoard from '../components/MiniBoard.svelte'
  import { api } from '../lib/api.ts'
  import { app, refresh } from '../lib/state.svelte.ts'
  import { FEATURES, landingFor } from '../../../shared/site.ts'
  import type { Account, Mood } from '../../../shared/types.ts'

  let name = $state('')
  let site = $state<'chesscom' | 'lichess'>('chesscom')
  let busy = $state(false)
  let error = $state<string | null>(null)
  let recent = $state<Account[]>([])

  void api.accounts().then(a => (recent = a))

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
    void enter(site, name)
  }

  const MOODS: Mood[] = ['shock', 'read', 'proud', 'cheer']
  const page = landingFor(location.pathname)
  if (page.path.includes('lichess')) site = 'lichess'
</script>

<div class="landing">
  <section class="hero">
    <div class="copy" in:fly={{ y: 14, duration: 460 }}>
      <span class="pill">100% free · no account · no paywall</span>
      <h1>{page.headline[0]}<em>{page.headline[1]}</em>{page.headline[2]}</h1>
      <p class="lead">{page.lead}</p>
      <div class="sites" role="tablist" aria-label="Where you play">
        <button role="tab" aria-selected={site === 'chesscom'} class:on={site === 'chesscom'} onclick={() => (site = 'chesscom')}>chess.com</button>
        <button role="tab" aria-selected={site === 'lichess'} class:on={site === 'lichess'} onclick={() => (site = 'lichess')}>Lichess</button>
      </div>
      <form onsubmit={submit}>
        <input bind:value={name} placeholder={site === 'lichess' ? 'Your Lichess username' : 'Your chess.com username'} autocomplete="off" spellcheck="false" aria-label="Username" />
        <button class="btn primary" disabled={busy || !name.trim()}>{busy ? 'Looking…' : 'Review my games'}</button>
      </form>
      {#if error}<p class="error" in:fly={{ y: 4 }}>{error}</p>{/if}
      {#if recent.length}
        <div class="recent">
          <span class="fine">Continue as</span>
          {#each recent.slice(0, 3) as a}
            <button class="chip account" onclick={() => enter(a.site, a.username)}>{a.username}<span>{a.site === 'lichess' ? 'Lichess' : 'chess.com'}</span></button>
          {/each}
        </div>
      {/if}
      <p class="fine">Only your public games are fetched. Nothing to sign up for. Not affiliated with chess.com or Lichess.</p>
    </div>
    <div class="mascot">
      <Pip mood={error ? 'sad' : busy ? 'think' : name ? 'happy' : 'idle'} size={210} follow />
      <div class="bubble b1"><Glyph label="brilliant" size={30} /><span>Brilliant</span></div>
      <div class="bubble b2"><Glyph label="blunder" size={30} /><span>Blunder</span></div>
      <div class="bubble b3"><Glyph label="great" size={30} /><span>Great find</span></div>
    </div>
  </section>

  <section class="features">
    {#each FEATURES as [title, text], i}
      <div class="feature card" in:fly={{ y: 16, delay: 120 + i * 80, duration: 420 }}>
        <Pip mood={MOODS[i]} size={70} />
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    {/each}
  </section>

  <section class="demo">
    <div class="demo-board">
      <MiniBoard fen="r1b1kbnr/pppp1Npp/8/6q1/2BnP3/8/PPPP1PPP/RNBQK2R b KQkq - 0 5" last="e5f7" size={300} />
      <span class="demo-badge"><Glyph label="blunder" size={40} /></span>
    </div>
    <div class="demo-text">
      <span class="label">What a review looks like</span>
      <h2>Not just “blunder”. The reason why.</h2>
      <div class="note card">
        <Pip mood="worried" size={58} />
        <p><b>5.Nxf7?? grabs the rook, but your g2 pawn was the real target.</b> After 5…Qxg2 the rook on h1 falls and mate follows on f3. Before taking anything, ask what the enemy queen attacks.</p>
      </div>
      <div class="demo-chips">
        <span class="chip"><Glyph label="best" size={20} />Best was 5.O-O</span>
        <span class="chip">A classic trap: the Blackburne Shilling Gambit</span>
      </div>
    </div>
  </section>

  <section class="steps">
    <h2>How it works</h2>
    <ol>
      <li><b>1</b><span>Type your chess.com or Lichess username.</span></li>
      <li><b>2</b><span>Pip fetches and analyzes your recent games.</span></li>
      <li><b>3</b><span>Read the coach's notes, then train what matters.</span></li>
    </ol>
  </section>

  <Footer />
</div>

<style>
  .landing {
    min-height: 100vh;
  }
  .hero {
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 80px 24px 60px;
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 40px;
    align-items: center;
  }
  .pill {
    display: inline-flex;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  h1 {
    font-size: clamp(36px, 5vw, 58px);
    line-height: 1.05;
    margin: 18px 0 16px;
  }
  em {
    font-style: normal;
    color: var(--accent);
  }
  .lead {
    font-size: 19px;
    line-height: 1.55;
    color: var(--dim);
    margin: 0 0 26px;
    max-width: 540px;
  }
  form {
    display: flex;
    gap: 10px;
    max-width: 560px;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 56px;
    padding: 0 18px;
    border-radius: 16px;
    background: var(--panel);
    border: 2px solid var(--line);
    font-size: 17px;
    font-weight: 700;
    outline: 0;
    transition: border-color 0.15s;
  }
  input:focus {
    border-color: var(--accent);
  }
  form .btn {
    height: 56px;
    padding: 0 26px;
  }
  .sites {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    margin-bottom: 12px;
    border-radius: 14px;
    background: var(--panel);
    border: 2px solid var(--line);
  }
  .sites button {
    padding: 7px 16px;
    border-radius: 10px;
    font-weight: 800;
    font-size: 14.5px;
    color: var(--dim);
    transition: background 0.15s, color 0.15s;
  }
  .sites button.on {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .recent {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }
  .recent .fine {
    margin: 0;
  }
  .account {
    height: 32px;
    gap: 8px;
    color: var(--text);
    cursor: pointer;
  }
  .account span {
    color: var(--faint);
    font-size: 12px;
  }
  .error {
    color: var(--red);
    font-weight: 800;
    margin: 12px 0 0;
  }
  .fine {
    font-size: 14px;
    color: var(--faint);
    margin: 14px 0 0;
  }
  .mascot {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 340px;
  }
  .bubble {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px 8px 8px;
    border-radius: 999px;
    background: var(--panel-2);
    border: 2px solid var(--line-2);
    font-weight: 900;
    font-size: 15px;
    animation: drift 6s ease-in-out infinite;
  }
  .b1 {
    top: 8%;
    left: 2%;
  }
  .b2 {
    top: 48%;
    right: 0;
    animation-delay: -2s;
  }
  .b3 {
    bottom: 4%;
    left: 10%;
    animation-delay: -4s;
  }
  @keyframes drift {
    50% {
      transform: translateY(-8px);
    }
  }
  .features {
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 0 24px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
  .feature {
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .feature h3 {
    margin: 6px 0 0;
    font-size: 18px;
  }
  .feature p {
    margin: 0;
    color: var(--dim);
    font-size: 15px;
    line-height: 1.5;
  }
  .demo {
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 70px 24px 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 44px;
    align-items: center;
  }
  .demo-board {
    position: relative;
    padding: 10px;
    border-radius: 22px;
    background: var(--panel);
    border: 2px solid var(--line);
    rotate: -2deg;
  }
  .demo-badge {
    position: absolute;
    left: calc(10px + 300px * 5 / 8 + 300px / 8 - 22px);
    top: calc(10px + 300px / 8 - 20px);
  }
  .demo-text {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .demo-text h2 {
    margin: 0;
    font-size: clamp(28px, 3.4vw, 38px);
    line-height: 1.1;
  }
  .note {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    padding: 18px 20px;
  }
  .note p {
    margin: 0;
    color: var(--dim);
    font-size: 16px;
    line-height: 1.55;
  }
  .note b {
    color: var(--text);
  }
  .demo-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .demo-chips .chip {
    height: 34px;
    gap: 8px;
    color: var(--dim);
  }
  .steps {
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 60px 24px 10px;
    text-align: center;
  }
  .steps h2 {
    font-size: 30px;
    margin: 0 0 22px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px;
    border-radius: var(--radius);
    background: var(--panel);
    border: 2px solid var(--line);
    text-align: left;
    font-weight: 800;
    font-size: 16px;
  }
  li b {
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: inset 0 -4px 0 var(--accent-d);
    font-size: 18px;
  }
  @media (max-width: 900px) {
    .demo {
      grid-template-columns: 1fr;
      justify-items: center;
    }
    .hero {
      grid-template-columns: 1fr;
      padding-top: 40px;
    }
    .mascot {
      order: -1;
      min-height: 260px;
    }
    .features,
    ol {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 560px) {
    form {
      flex-direction: column;
    }
    .features,
    ol {
      grid-template-columns: 1fr;
    }
  }
</style>
