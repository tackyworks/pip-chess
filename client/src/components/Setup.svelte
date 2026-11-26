<script lang="ts">
  import { untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import Pip from './Pip.svelte'
  import { app } from '../lib/state.svelte.ts'

  let shown = $state(false)
  const share = $derived(Math.round(((app.setup.engine + app.setup.model) / 2) * 100))

  $effect(() => {
    if (!app.setup.active) return void (shown = false)
    const timer = setTimeout(() => (shown = untrack(() => share) < 90), 700)
    return () => clearTimeout(timer)
  })
</script>

{#if shown && app.setup.active}
  <div class="setup card" transition:fly={{ y: 16, duration: 260 }} role="status">
    <Pip mood="read" size={46} />
    <div class="body">
      <b>Setting up Pip’s brain</b>
      <span>One-time download, then it works instantly. {share}%</span>
      <div class="bar"><span style="width: {share}%"></span></div>
    </div>
  </div>
{/if}

<style>
  .setup {
    position: fixed;
    left: 20px;
    bottom: 20px;
    z-index: 40;
    width: min(340px, calc(100vw - 40px));
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: var(--panel);
    box-shadow: 0 20px 50px -20px rgb(0 0 0 / 0.8);
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  b {
    font-size: 15.5px;
  }
  span {
    font-size: 13px;
    color: var(--dim);
  }
  .bar {
    height: 8px;
    margin-top: 4px;
    border-radius: 8px;
    background: var(--line);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.3s var(--ease);
  }
  @media (max-width: 760px) {
    .setup {
      bottom: 96px;
    }
  }
</style>
