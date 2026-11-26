<script lang="ts">
  import { fade, fly } from 'svelte/transition'
  import { go } from '../lib/router.svelte.ts'

  let open = $state(false)

  const GROUPS = [
    {
      title: 'Game review',
      keys: [
        ['←  →', 'Previous / next move'],
        ['↓  ↑', 'Next / previous key moment'],
        ['Home  End', 'Start / end of the game'],
        ['R', 'Retry your mistake'],
        ['F', 'Flip the board'],
        ['Esc', 'Back to the game line'],
      ],
    },
    {
      title: 'Anywhere',
      keys: [
        ['?', 'Show this sheet'],
        ['G', 'Games'],
        ['I', 'Insights'],
        ['O', 'Openings'],
        ['T', 'Train'],
        ['P', 'Play Pip'],
      ],
    },
  ]

  const ROUTES: Record<string, string> = { g: '/', i: '/insights', o: '/openings', t: '/train', p: '/play' }

  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === '?') {
      open = !open
      return
    }
    if (e.key === 'Escape' && open) {
      open = false
      return
    }
    const route = ROUTES[e.key.toLowerCase()]
    if (route && !location.pathname.startsWith('/game/') && !location.pathname.startsWith('/play')) go(route)
  }

  export const show = () => (open = true)
</script>

<svelte:window onkeydown={keys} />

{#if open}
  <div class="scrim" transition:fade={{ duration: 150 }}>
    <button class="backdrop" aria-label="Close" onclick={() => (open = false)}></button>
    <div class="sheet card" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" transition:fly={{ y: 16, duration: 220 }}>
      <h2>Keyboard shortcuts</h2>
      <div class="groups">
        {#each GROUPS as g}
          <section>
            <h3 class="label">{g.title}</h3>
            {#each g.keys as [k, what]}
              <div class="key-row">
                <span class="keys">{#each k.split('  ') as part}<kbd>{part}</kbd>{/each}</span>
                <span class="what">{what}</span>
              </div>
            {/each}
          </section>
        {/each}
      </div>
      <button class="btn primary" onclick={() => (open = false)}>Got it</button>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgb(0 0 0 / 0.7);
  }
  .backdrop {
    position: absolute;
    inset: 0;
    cursor: default;
  }
  .sheet {
    position: relative;
    width: min(620px, 100%);
    padding: 26px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  h2 {
    margin: 0;
    font-size: 24px;
  }
  .groups {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  h3 {
    margin: 0 0 10px;
  }
  .key-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
  }
  .keys {
    display: flex;
    gap: 6px;
    min-width: 96px;
  }
  kbd {
    font: 800 13px var(--font);
    padding: 3px 9px;
    border-radius: 8px;
    background: var(--panel-2);
    border: 2px solid var(--line-2);
    border-bottom-width: 3px;
    color: var(--text);
  }
  .what {
    color: var(--dim);
    font-size: 15px;
  }
  @media (max-width: 640px) {
    .groups {
      grid-template-columns: 1fr;
    }
  }
</style>
