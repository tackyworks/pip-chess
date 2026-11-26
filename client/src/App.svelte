<script lang="ts">
  import { fly } from 'svelte/transition'
  import Pip from './components/Pip.svelte'
  import Toaster from './components/Toaster.svelte'
  import Shortcuts from './components/Shortcuts.svelte'
  import Footer from './components/Footer.svelte'
  import Setup from './components/Setup.svelte'
  import Consent from './components/Consent.svelte'
  import Welcome from './views/Welcome.svelte'
  import Games from './views/Games.svelte'
  import { app, refresh, working } from './lib/state.svelte.ts'
  import { go, href, router } from './lib/router.svelte.ts'
  import Avatar from './components/Avatar.svelte'
  import { api } from './lib/api.ts'
  import { BOARDS, PIECE_SETS, settings, type BoardTheme } from './lib/settings.svelte.ts'
  import type { Account } from '../../shared/types.ts'
  import { landingFor } from '../../shared/site.ts'

  void refresh()

  const VIEWS = {
    review: () => import('./views/Review.svelte'),
    insights: () => import('./views/Insights.svelte'),
    openings: () => import('./views/Openings.svelte'),
    train: () => import('./views/Train.svelte'),
    play: () => import('./views/Play.svelte'),
    about: () => import('./views/About.svelte'),
    shared: () => import('./views/Shared.svelte'),
  }

  const idle = globalThis.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200))
  idle(() => Object.values(VIEWS).forEach(load => void load()))

  const ICONS = {
    games: 'M4 5.5h12M4 10h12M4 14.5h8',
    insights: 'M4.5 15.5v-4M10 15.5v-10M15.5 15.5v-6.5',
    openings: 'M3.5 5.6c2.3-.9 4.5-.6 6.5.9 2-1.5 4.2-1.8 6.5-.9v9.8c-2.3-.9-4.5-.6-6.5.9-2-1.5-4.2-1.8-6.5-.9zM10 6.5v9.8',
    train: 'M10 16.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    play: 'M5.5 16.5h9.5M7 16.5c-.2-3 1.4-4.8 3.2-6l-2.7.3c-1.3.1-2.1-.9-1.6-2l2.7-4.6.5-1.2 1.8 1.2c3 .6 4.7 3.5 4.4 7.6-.1 1.8-.5 3.4-.8 4.7',
  } as const

  const TABS = [
    { name: 'games', label: 'Games', path: '/' },
    { name: 'insights', label: 'Insights', path: '/insights' },
    { name: 'openings', label: 'Openings', path: '/openings' },
    { name: 'train', label: 'Train', path: '/train' },
    { name: 'play', label: 'Play', path: '/play' },
  ] as const

  const TITLES: Record<string, string> = {
    games: 'Your games',
    game: 'Game review',
    insights: 'Insights',
    openings: 'Openings',
    train: 'Train',
    play: 'Play Pip',
    about: 'About',
    privacy: 'Privacy',
  }

  const FOOTER = new Set(['games', 'insights', 'about', 'privacy'])

  const active = $derived(router.route.name === 'game' ? 'games' : router.route.name)
  const busy = $derived(working())
  const viewKey = $derived(router.route.name === 'game' ? `game:${router.route.id}` : router.route.name)
  const streak = $derived(app.me?.streak ?? null)
  const goalMet = $derived(!!streak && streak.today >= streak.goal)
  let open = $state<'settings' | 'streak' | null>(null)
  let shortcuts: Shortcuts | undefined = $state()

  let others = $state<Account[]>([])

  const toggleSettings = async () => {
    open = open === 'settings' ? null : 'settings'
    if (open) others = (await api.accounts()).filter(a => a.key !== app.me?.account?.key).slice(0, 3)
  }

  const signOut = async () => {
    open = null
    app.me = await api.signOut()
    app.games = []
    go('/')
  }

  const switchTo = async (a: Account) => {
    open = null
    app.games = []
    app.me = await api.signIn(a.site, a.username)
    app.syncing = true
    go('/')
    await refresh()
  }

  $effect(() => {
    if (!app.loaded) return
    try {
      if (app.me?.username) localStorage.setItem('pip.account', '1')
      else localStorage.removeItem('pip.account')
    } catch {}
  })

  $effect(() => {
    if (router.route.name === 'shared') return
    document.title = app.me?.username ? `${TITLES[router.route.name] ?? 'Pip'} · Pip` : landingFor(location.pathname).title
  })
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && (open = null)} />

{#snippet icon(name: keyof typeof ICONS)}
  <svg viewBox="0 0 20 20" width="20" height="20" class="tab-icon"><path d={ICONS[name]} /></svg>
{/snippet}

<Toaster />
<Setup />
<Consent />
<Shortcuts bind:this={shortcuts} />

{#if !app.loaded}
  <div class="boot"><Pip mood="idle" size={80} /></div>
{:else if router.route.name === 'shared'}
  {#await VIEWS.shared() then m}<m.default id={router.route.id} />{/await}
{:else if !app.me?.username}
  <Welcome />
{:else}
  <header class="nav">
    <a class="brand" href={href('/')}>
      <Pip mood={busy ? 'think' : 'idle'} size={34} follow />
      <span>pip</span>
    </a>
    <nav class="tabs">
      {#each TABS as tab}
        <a class="tab" class:on={active === tab.name} href={href(tab.path)}>{@render icon(tab.name)}<span>{tab.label}</span></a>
      {/each}
    </nav>
    <div class="right">
      {#if busy}
        <span class="chip queue" title="Games waiting for analysis" in:fly={{ y: -4, duration: 200 }}>
          <svg viewBox="0 0 20 20" width="15" height="15"><circle cx="10" cy="10" r="7.5" /><path d="M10 5.5v4.5l3 2" /></svg>
          <span class="num">{busy}</span>
        </span>
      {/if}
      {#if streak}
        <button class="chip streak" class:lit={goalMet} onclick={() => (open = open === 'streak' ? null : 'streak')} aria-label="Daily streak">
          <svg viewBox="0 0 20 20" width="18" height="18"><path d="M10 18c-3.3 0-5.7-2.3-5.7-5.4 0-2.7 1.7-4.2 2.9-5.8.6 1.6 1.6 2.4 2.5 2.7-.2-2.4.6-4.8 2.7-7 .4 2.9 3.3 4.7 3.3 9 0 3.8-2.3 6.5-5.7 6.5z" /></svg>
          <span class="num">{streak.days}</span>
          <svg class="ring" viewBox="0 0 20 20" width="18" height="18"><circle cx="10" cy="10" r="7.5" class="track" /><circle cx="10" cy="10" r="7.5" class="fill" stroke-dasharray="{Math.min(1, streak.today / streak.goal) * 47.1} 47.1" /></svg>
        </button>
      {/if}
      <button class="btn icon gear" class:on={open === 'settings'} onclick={toggleSettings} aria-label="Settings">
        <svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z M16.2 11.8l1.3 1-1.6 2.8-1.6-.6a6 6 0 0 1-1.7 1l-.3 1.7H9l-.3-1.7a6 6 0 0 1-1.7-1l-1.6.6-1.6-2.8 1.3-1a6 6 0 0 1 0-2l-1.3-1L5.4 4.6l1.6.6a6 6 0 0 1 1.7-1L9 2.5h3.2l.3 1.7a6 6 0 0 1 1.7 1l1.6-.6 1.6 2.8-1.3 1a6 6 0 0 1 .1 2.4z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round" /></svg>
      </button>
      {#if open}
        <button class="scrim" aria-label="Close" onclick={() => (open = null)}></button>
      {/if}
      {#if open === 'streak' && streak}
        <div class="popover card streak-card" transition:fly={{ y: -8, duration: 200 }}>
          <div class="streak-head">
            <Pip mood={goalMet ? 'cheer' : 'happy'} size={60} />
            <div>
              <div class="big num">{streak.days} day{streak.days === 1 ? '' : 's'}</div>
              <div class="soft">best streak {streak.best}</div>
            </div>
          </div>
          <div class="goal">
            <div class="goal-bar"><span style="width: {Math.min(1, streak.today / streak.goal) * 100}%"></span></div>
            <span class="num">{Math.min(streak.today, streak.goal)}/{streak.goal}</span>
          </div>
          <p class="soft">{goalMet ? 'Daily goal done. See you tomorrow!' : 'Solve puzzles, practice openings, review a game or play Pip to reach today’s goal.'}</p>
        </div>
      {:else if open === 'settings'}
        <div class="popover card settings" transition:fly={{ y: -8, duration: 200 }}>
          {#if app.me?.account}
            <div class="who">
              <Avatar name={app.me.account.username} size={42} />
              <div>
                <b>{app.me.account.username}</b>
                <span class="soft">{app.me.account.site === 'lichess' ? 'Lichess' : 'chess.com'}</span>
              </div>
            </div>
            {#each others as a (a.key)}
              <button class="other" onclick={() => switchTo(a)}>
                <Avatar name={a.username} size={30} />
                <span>{a.username}</span>
                <small>{a.site === 'lichess' ? 'Lichess' : 'chess.com'}</small>
              </button>
            {/each}
            <div class="account-actions">
              <button class="btn" onclick={signOut}>Add account</button>
              <button class="btn ghost" onclick={signOut}>Sign out</button>
            </div>
          {/if}
          <div class="group">
            <span class="label">Board</span>
            <div class="swatches">
              {#each Object.entries(BOARDS) as [name, c]}
                <button class="swatch" class:on={settings.board === name} onclick={() => (settings.board = name as BoardTheme)} aria-label={name} title={name}>
                  <span style="background: {c.light}"></span><span style="background: {c.dark}"></span><span style="background: {c.dark}"></span><span style="background: {c.light}"></span>
                </button>
              {/each}
            </div>
          </div>
          <div class="group">
            <span class="label">Pieces</span>
            <div class="swatches">
              {#each PIECE_SETS as set}
                <button class="set" class:on={settings.pieces === set} onclick={() => (settings.pieces = set)} title={set}>
                  <img src="/pieces/{set}/wN.svg" alt={set} width="34" height="34" />
                </button>
              {/each}
            </div>
          </div>
          <label class="toggle"><span>Sounds</span><input type="checkbox" bind:checked={settings.sound} /><i></i></label>
          <label class="toggle"><span>Coordinates</span><input type="checkbox" bind:checked={settings.coords} /><i></i></label>
          <button class="link" onclick={() => { open = null; shortcuts?.show() }}>Keyboard shortcuts <kbd>?</kbd></button>
        </div>
      {/if}
    </div>
  </header>

  <main>
    {#key viewKey}
      <div class="view">
        {#if router.route.name === 'game'}
          {#await VIEWS.review() then m}<m.default id={router.route.id} />{/await}
        {:else if router.route.name === 'insights'}
          {#await VIEWS.insights() then m}<m.default />{/await}
        {:else if router.route.name === 'openings'}
          {#await VIEWS.openings() then m}<m.default color={router.route.color} />{/await}
        {:else if router.route.name === 'train'}
          {#await VIEWS.train() then m}<m.default theme={router.route.theme} />{/await}
        {:else if router.route.name === 'play'}
          {#await VIEWS.play() then m}<m.default />{/await}
        {:else if router.route.name === 'about' || router.route.name === 'privacy'}
          {#await VIEWS.about() then m}<m.default page={router.route.name} />{/await}
        {:else}
          <Games />
        {/if}
      </div>
    {/key}
  </main>

  {#if FOOTER.has(router.route.name)}
    <Footer onshortcuts={() => shortcuts?.show()} />
  {/if}

  <nav class="dock">
    {#each TABS as tab}
      <a class="dock-tab" class:on={active === tab.name} href={href(tab.path)}>{@render icon(tab.name)}<span>{tab.label}</span></a>
    {/each}
  </nav>
{/if}

<style>
  .boot {
    min-height: 100vh;
    display: grid;
    place-items: center;
  }
  .nav {
    position: sticky;
    top: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    height: 70px;
    padding: 0 24px;
    background: var(--bg);
    border-bottom: 2px solid var(--line);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--accent);
    text-decoration: none;
    font-family: var(--display);
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.01em;
    justify-self: start;
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 14px;
    border: 2px solid transparent;
    color: var(--dim);
    text-decoration: none;
    font-weight: 800;
    font-size: 14.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .tab:hover {
    background: var(--panel);
    color: var(--text);
  }
  .tab.on {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .tab-icon {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
  .right {
    position: relative;
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .chip svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }
  .queue {
    height: 34px;
  }
  .streak {
    height: 38px;
    padding: 0 10px 0 8px;
    font-size: 15px;
    color: var(--dim);
    border: 2px solid var(--line);
    background: transparent;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .streak:hover {
    border-color: var(--line-2);
  }
  .streak svg:first-child {
    fill: var(--faint);
    stroke: none;
  }
  .streak.lit {
    color: var(--orange);
  }
  .streak.lit svg:first-child {
    fill: var(--orange);
  }
  .ring {
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 3;
  }
  .ring .track {
    stroke: var(--line-2);
  }
  .ring .fill {
    stroke: var(--orange);
    transition: stroke-dasharray 0.5s var(--ease);
  }
  .gear {
    color: var(--dim);
  }
  .gear svg {
    transition: transform 0.45s var(--spring);
  }
  .gear.on svg {
    transform: rotate(60deg);
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 29;
    cursor: default;
  }
  .popover {
    position: absolute;
    top: 56px;
    right: 0;
    z-index: 30;
    width: 290px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--panel);
    box-shadow: 0 24px 60px -20px rgb(0 0 0 / 0.8);
  }
  .streak-head {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .big {
    font-size: 26px;
    font-weight: 900;
    color: var(--orange);
  }
  .soft {
    color: var(--dim);
    margin: 0;
    font-size: 14.5px;
  }
  .goal {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 900;
  }
  .goal-bar {
    flex: 1;
    height: 14px;
    border-radius: 14px;
    background: var(--line);
    overflow: hidden;
  }
  .goal-bar span {
    display: block;
    height: 100%;
    border-radius: 14px;
    background: var(--orange);
    box-shadow: inset 0 -3px 0 var(--orange-d);
    transition: width 0.5s var(--spring);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .who div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .who b {
    font-size: 17px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .other {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: -8px -8px 0;
    padding: 6px 8px;
    border-radius: 12px;
    font-weight: 800;
    text-align: left;
    transition: background 0.15s;
  }
  .other:hover {
    background: var(--panel-2);
  }
  .other span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .other small {
    color: var(--faint);
    font-size: 12px;
  }
  .account-actions {
    display: flex;
    gap: 8px;
    padding-bottom: 14px;
    border-bottom: 2px solid var(--line);
  }
  .account-actions .btn {
    flex: 1;
    height: 40px;
    padding: 0 10px;
    font-size: 13px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .swatches {
    display: flex;
    gap: 10px;
  }
  .swatch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    overflow: hidden;
    outline: 3px solid transparent;
    outline-offset: 2px;
    transition: outline-color 0.15s, transform 0.2s var(--spring);
  }
  .set {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: var(--bg);
    outline: 3px solid transparent;
    outline-offset: 2px;
    transition: outline-color 0.15s, transform 0.2s var(--spring);
  }
  .swatch:hover,
  .set:hover {
    transform: translateY(-2px);
  }
  .swatch.on,
  .set.on {
    outline-color: var(--accent);
  }
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-weight: 700;
  }
  .toggle input {
    display: none;
  }
  .toggle i {
    width: 44px;
    height: 26px;
    border-radius: 26px;
    background: var(--line-2);
    position: relative;
    transition: background 0.2s;
  }
  .toggle i::after {
    content: '';
    position: absolute;
    top: 4px;
    left: 4px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.3s var(--spring);
  }
  .toggle input:checked + i {
    background: var(--accent);
  }
  .toggle input:checked + i::after {
    transform: translateX(18px);
  }
  .link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 700;
    color: var(--dim);
  }
  .link:hover {
    color: var(--text);
  }
  kbd {
    font: 800 12px var(--font);
    padding: 2px 8px;
    border-radius: 7px;
    background: var(--panel-2);
    border: 2px solid var(--line-2);
  }
  .view {
    animation: enter 0.22s var(--ease);
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .dock {
    display: none;
  }
  @media (max-width: 1100px) {
    .tab span {
      display: none;
    }
    .tab {
      padding: 8px 12px;
    }
  }
  @media (max-width: 760px) {
    .nav {
      grid-template-columns: 1fr auto;
      padding: 0 16px;
    }
    .tabs {
      display: none;
    }
    .dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 25;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
      background: var(--bg);
      border-top: 2px solid var(--line);
    }
    .dock-tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 6px 0;
      border-radius: 12px;
      color: var(--faint);
      text-decoration: none;
      font-size: 11.5px;
      font-weight: 800;
    }
    .dock-tab.on {
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
    }
    .dock-tab .tab-icon {
      width: 24px;
      height: 24px;
    }
    main {
      padding-bottom: 84px;
    }
  }
</style>
