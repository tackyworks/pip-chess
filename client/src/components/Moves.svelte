<script lang="ts">
  import Glyph from './Glyph.svelte'
  import { LABELS } from '../lib/labels.ts'
  import type { Label } from '../../../shared/types.ts'

  interface Move {
    san: string
    label?: Label
  }

  let { moves, current, blackFirst = false, onselect }: { moves: Move[]; current: number; blackFirst?: boolean; onselect: (ply: number) => void } = $props()

  let list: HTMLDivElement

  const rows = $derived.by(() => {
    const cells: (Move & { ply: number })[] = moves.map((m, i) => ({ ...m, ply: i + 1 }))
    const padded = blackFirst ? [null, ...cells] : cells
    const out: { no: number; white: (typeof cells)[number] | null; black: (typeof cells)[number] | null }[] = []
    for (let i = 0; i < padded.length; i += 2) out.push({ no: i / 2 + 1, white: padded[i], black: padded[i + 1] ?? null })
    return out
  })

  $effect(() => {
    list?.querySelector(`[data-ply="${current}"]`)?.scrollIntoView({ block: 'nearest' })
  })
</script>

{#snippet cell(m: (Move & { ply: number }) | null)}
  {#if m}
    <button class="move" class:on={m.ply === current} data-ply={m.ply} onclick={() => onselect(m.ply)}>
      <span>{m.san}</span>
      {#if m.label && LABELS[m.label].notable}
        <Glyph label={m.label} size={20} />
      {/if}
    </button>
  {:else}
    <span class="move empty">…</span>
  {/if}
{/snippet}

<div class="moves" bind:this={list}>
  {#each rows as row}
    <div class="row">
      <span class="no num">{row.no}</span>
      {@render cell(row.white)}
      {@render cell(row.black)}
    </div>
  {/each}
</div>

<style>
  .moves {
    overflow-y: auto;
    padding: 6px;
    scrollbar-gutter: stable;
  }
  .row {
    display: grid;
    grid-template-columns: 38px 1fr 1fr;
    align-items: center;
    gap: 4px;
  }
  .row:nth-child(odd) {
    background: color-mix(in srgb, var(--bg) 45%, transparent);
    border-radius: 10px;
  }
  .no {
    color: var(--faint);
    font-size: 13.5px;
    font-weight: 800;
    text-align: right;
    padding-right: 10px;
  }
  .move {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 34px;
    padding: 4px 10px;
    border-radius: 10px;
    border: 2px solid transparent;
    font-weight: 800;
    font-size: 15.5px;
    text-align: left;
    color: var(--dim);
    transition: background 0.12s, color 0.12s;
  }
  .move:hover {
    background: var(--panel-2);
    color: var(--text);
  }
  .move.on {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    color: var(--text);
  }
  .empty {
    color: var(--faint);
  }
</style>
