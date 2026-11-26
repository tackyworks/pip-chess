<script lang="ts">
  import Pip from '../components/Pip.svelte'
  import Review from './Review.svelte'
  import { fetchShared } from '../lib/share.ts'
  import { app } from '../lib/state.svelte.ts'
  import type { GameDetail } from '../../../shared/types.ts'

  let { id }: { id: string } = $props()

  let detail = $state<GameDetail | null>(null)
  let failed = $state<string | null>(null)

  $effect(() => {
    detail = null
    failed = null
    fetchShared(id).then(
      d => (detail = d),
      e => (failed = (e as Error).message),
    )
  })

  $effect(() => {
    if (detail) document.title = `${detail.game.white.name} vs ${detail.game.black.name} · Pip`
  })
</script>

<header class="bar">
  <a class="brand" href="/"><Pip mood="happy" size={34} /><span>pip</span></a>
  <span class="note">A game review shared from Pip, the free chess coach.</span>
  <a class="btn primary cta" href="/">{app.me?.username ? 'Your games' : 'Review my games, free'}</a>
</header>

{#if failed}
  <div class="empty">
    <Pip mood="sad" size={96} />
    <p>{failed}</p>
    <a class="btn" href="/">Go to Pip</a>
  </div>
{:else if detail}
  <Review id={`shared:${id}`} shared={detail} />
{:else}
  <div class="empty"><Pip mood="think" size={80} /></div>
{/if}

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 18px;
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
    font: 700 28px var(--display, var(--font));
  }
  .note {
    flex: 1;
    color: var(--dim);
    font-weight: 700;
  }
  .cta {
    height: 44px;
    padding: 0 20px;
  }
  .empty {
    min-height: 60vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 16px;
    color: var(--dim);
  }
  @media (max-width: 760px) {
    .note {
      display: none;
    }
    .bar {
      justify-content: space-between;
    }
  }
</style>
