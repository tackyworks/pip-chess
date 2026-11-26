<script lang="ts">
  import { fly } from 'svelte/transition'
  import Pip from './Pip.svelte'
  import { config, type SiteConfig } from '../lib/config.ts'
  import { consent, decide, needsBanner } from '../lib/consent.svelte.ts'

  let site = $state<SiteConfig | null>(null)
  void config.then(c => (site = c))

  const shown = $derived(needsBanner(site) && (consent.choice === null || consent.open))
</script>

{#if shown}
  <div class="consent card" role="dialog" aria-label="Cookie choices" transition:fly={{ y: 20, duration: 280 }}>
    <Pip mood="happy" size={54} />
    <div class="text">
      <b>Pip is free because of a few small ads.</b>
      <span>May we use cookies to show them? Saying no keeps everything working, just without ads from Google. <a href="/privacy">Privacy</a></span>
    </div>
    <div class="actions">
      <button class="btn ghost" onclick={() => decide('denied')}>No thanks</button>
      <button class="btn primary" onclick={() => decide('granted')}>Allow</button>
    </div>
  </div>
{/if}

<style>
  .consent {
    position: fixed;
    left: 50%;
    bottom: 20px;
    z-index: 45;
    translate: -50% 0;
    width: min(760px, calc(100vw - 32px));
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 18px;
    background: var(--panel);
    box-shadow: 0 24px 60px -24px rgb(0 0 0 / 0.85);
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  b {
    font-size: 16px;
  }
  span {
    color: var(--dim);
    font-size: 14px;
    line-height: 1.45;
  }
  a {
    color: var(--accent);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex: none;
  }
  .actions .btn {
    height: 44px;
    padding: 0 18px;
  }
  @media (max-width: 640px) {
    .consent {
      flex-wrap: wrap;
      bottom: 92px;
    }
    .actions {
      width: 100%;
    }
    .actions .btn {
      flex: 1;
    }
  }
</style>
