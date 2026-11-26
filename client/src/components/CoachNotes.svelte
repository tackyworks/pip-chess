<script lang="ts">
  import { fade, fly } from 'svelte/transition'
  import Pip from './Pip.svelte'
  import type { Mood, Notes } from '../../../shared/types.ts'

  let { notes, mood, onclose }: { notes: Notes; mood: Mood; onclose: () => void } = $props()
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && onclose()} />

<div class="scrim" transition:fade={{ duration: 160 }}>
  <button class="backdrop" aria-label="Close notes" onclick={onclose}></button>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Coach's notes" transition:fly={{ y: 24, duration: 260 }}>
    <header>
      <Pip {mood} size={70} />
      <div>
        <span class="label">Coach's notes</span>
        <p class="story">{notes.story}</p>
      </div>
    </header>

    {#if notes.good.length}
      <section>
        <h3 class="label">What went well</h3>
        {#each notes.good as text}
          <div class="item good">
            <span class="dot"><svg viewBox="0 0 20 20"><path d="M5.5 10.4l3 3 6-6.4" /></svg></span>
            <p>{text}</p>
          </div>
        {/each}
      </section>
    {/if}

    {#if notes.work.length}
      <section>
        <h3 class="label">What to work on</h3>
        {#each notes.work as w}
          <div class="item work">
            <span class="dot"><svg viewBox="0 0 20 20"><path d="M10 5.5v5.5M10 14.5v.1" /></svg></span>
            <div>
              <p>{w.text}</p>
              <p class="tip">{w.tip}</p>
            </div>
          </div>
        {/each}
      </section>
    {/if}

    {#if notes.plan}
      <section class="plan">
        <h3 class="label">The plan</h3>
        <p>{notes.plan}</p>
      </section>
    {/if}

    <section class="next">
      <h3 class="label">Next game</h3>
      <p>{notes.next}</p>
    </section>

    <button class="btn primary close" onclick={onclose}>Got it</button>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgb(0 0 0 / 0.72);
  }
  .backdrop {
    position: absolute;
    inset: 0;
    cursor: default;
  }
  .sheet {
    position: relative;
    width: min(580px, 100%);
    max-height: 88vh;
    overflow-y: auto;
    padding: 26px 28px 28px;
    border-radius: 24px;
    background: var(--panel);
    border: 2px solid var(--line);
    border-bottom-width: 5px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  header {
    display: flex;
    gap: 18px;
    align-items: center;
  }
  .story {
    margin: 6px 0 0;
    font-size: 19px;
    font-weight: 800;
    line-height: 1.35;
  }
  h3 {
    margin: 0 0 10px;
  }
  section p {
    margin: 0;
    font-size: 16.5px;
    line-height: 1.5;
  }
  .item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .item + .item {
    margin-top: 12px;
  }
  .dot {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    flex: none;
    display: grid;
    place-items: center;
    margin-top: 1px;
  }
  .dot svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: #fff;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .good .dot {
    background: var(--accent);
    box-shadow: inset 0 -2px 0 var(--accent-d);
  }
  .work .dot {
    background: var(--orange);
    box-shadow: inset 0 -2px 0 var(--orange-d);
  }
  .tip {
    margin-top: 6px !important;
    color: var(--dim);
    font-size: 15.5px !important;
  }
  .plan,
  .next {
    padding: 16px 18px;
    border-radius: 16px;
    border: 2px solid;
  }
  .plan {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .plan .label {
    color: var(--accent);
  }
  .next {
    background: color-mix(in srgb, var(--gold) 10%, transparent);
    border-color: color-mix(in srgb, var(--gold) 50%, transparent);
  }
  .next .label {
    color: var(--gold);
  }
  .next p {
    font-weight: 800;
  }
  .close {
    align-self: stretch;
  }
</style>
