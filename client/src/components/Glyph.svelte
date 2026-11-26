<script module lang="ts">
  const QUESTION = 'M-2.6 -2.9 a2.75 2.75 0 1 1 3.9 2.45 c-0.85 0.42 -1.3 0.95 -1.3 1.85 v0.35'
  const BANG = 'M0 -4.6 V0.9'
  const STAR = 'M12 5.4l1.96 4.02 4.42.62-3.2 3.12.76 4.4L12 15.5l-3.94 2.06.76-4.4-3.2-3.12 4.42-.62z'
  const THUMB =
    'M9.4 18.2h5.4c.66 0 1.22-.44 1.4-1.07l1.32-4.6A1.45 1.45 0 0 0 16.1 10.7h-2.9l.5-2.43a1.5 1.5 0 0 0-1.47-1.8l-2.83 4.12zM6.2 11h1.6v7.2H6.2z'
  const BOOK = 'M5.6 7.6c2.2-.6 4.5-.3 6.4 1.1v8.8c-1.9-1.3-4.2-1.6-6.4-1.1zM18.4 7.6c-2.2-.6-4.5-.3-6.4 1.1v8.8c1.9-1.3 4.2-1.6 6.4-1.1z'
</script>

<script lang="ts">
  import { LABELS } from '../lib/labels.ts'
  import type { Label } from '../../../shared/types.ts'

  let { label, size = 20 }: { label: Label; size?: number } = $props()
  const glyph = $derived(LABELS[label].glyph)
  const ink = $derived(label === 'inaccuracy' ? '#5c4300' : '#fff')
</script>

{#snippet question(x: number, s = 1)}
  <g transform="translate({x} 12.2) scale({s})">
    <path d={QUESTION} />
    <circle cx="0" cy="4.15" r="1.32" class="dot" />
  </g>
{/snippet}

{#snippet bang(x: number, s = 1)}
  <g transform="translate({x} 12.2) scale({s})">
    <path d={BANG} />
    <circle cx="0" cy="4.15" r="1.32" class="dot" />
  </g>
{/snippet}

<svg class="glyph" viewBox="0 0 24 24" width={size} height={size} style="--c: var(--c-{label}); --d: var(--d-{label}); --ink: {ink}" role="img" aria-label={LABELS[label].name}>
  <circle cx="12" cy="13.3" r="10.7" fill="var(--d)" />
  <circle cx="12" cy="11.7" r="10.7" fill="var(--c)" />
  <path d="M5.4 8.6a7.6 7.6 0 0 1 4.2-4.3" class="shine" />
  <g class="ink">
    {#if glyph === '!!'}
      {@render bang(9.1)}{@render bang(14.9)}
    {:else if glyph === '!'}
      {@render bang(12)}
    {:else if glyph === '?'}
      {@render question(12.5)}
    {:else if glyph === '??'}
      {@render question(8.9, 0.84)}{@render question(15.6, 0.84)}
    {:else if glyph === '?!'}
      {@render question(9.6, 0.88)}{@render bang(15.6, 0.88)}
    {:else if glyph === 'star'}
      <path d={STAR} class="fill" stroke-width="1.2" transform="translate(0 -0.2)" />
    {:else if glyph === 'check'}
      <path d="M7.6 12l3 3 5.8-6.2" />
    {:else if glyph === 'thumb'}
      <path d={THUMB} class="fill" stroke-width="0.6" transform="translate(0 -0.4)" />
    {:else if glyph === 'book'}
      <path d={BOOK} class="fill" stroke-width="0.4" transform="translate(0 -0.6)" />
    {:else if glyph === 'arrow'}
      <path d="M7 11.8h9.2M12.8 8.2l3.6 3.6-3.6 3.6" />
    {:else if glyph === 'x'}
      <path d="M8.4 8.2l7.2 7.2M15.6 8.2l-7.2 7.2" />
    {:else}
      <circle cx="12" cy="11.8" r="2.4" class="fill" stroke-width="0" />
    {/if}
  </g>
</svg>

<style>
  .glyph {
    flex: none;
    display: block;
    overflow: visible;
  }
  .shine {
    fill: none;
    stroke: #fff;
    stroke-opacity: 0.38;
    stroke-width: 1.7;
    stroke-linecap: round;
  }
  .ink {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ink :global(.dot),
  .ink .fill {
    fill: var(--ink);
    stroke: var(--ink);
  }
  .ink :global(.dot) {
    stroke-width: 0;
  }
</style>
