<script lang="ts">
  import { fly } from 'svelte/transition'
  import { flip } from 'svelte/animate'
  import { toasts } from '../lib/toast.svelte.ts'
</script>

<div class="toaster" aria-live="polite">
  {#each toasts as t (t.id)}
    <svelte:element this={t.href ? 'a' : 'div'} href={t.href} class="toast {t.tone}" in:fly={{ y: 24, duration: 260 }} out:fly={{ y: 12, duration: 180 }} animate:flip={{ duration: 200 }}>
      <span class="mark">
        {#if t.tone === 'good'}
          <svg viewBox="0 0 20 20"><path d="M5.5 10.4l3 3 6-6.4" /></svg>
        {:else if t.tone === 'bad'}
          <svg viewBox="0 0 20 20"><path d="M10 5.5v5.5M10 14.5v.1" /></svg>
        {:else}
          <svg viewBox="0 0 20 20"><path d="M10 9v5M10 6v.1" /></svg>
        {/if}
      </span>
      {t.text}
      {#if t.href}<span class="go">Open</span>{/if}
    </svelte:element>
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    left: 50%;
    bottom: 26px;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px 12px 12px;
    border-radius: 16px;
    background: var(--panel-2);
    border: 2px solid var(--line-2);
    border-bottom-width: 4px;
    color: var(--text);
    text-decoration: none;
    font-weight: 800;
    font-size: 15px;
    box-shadow: 0 16px 40px -16px rgb(0 0 0 / 0.8);
    white-space: nowrap;
  }
  .mark {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--line-2);
  }
  .good .mark {
    background: var(--accent);
  }
  .bad .mark {
    background: var(--red);
  }
  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: #fff;
    stroke-width: 2.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .good svg {
    stroke: var(--accent-ink);
  }
  .go {
    margin-left: 6px;
    color: var(--accent);
    text-transform: uppercase;
    font-size: 13px;
    letter-spacing: 0.05em;
  }
</style>
