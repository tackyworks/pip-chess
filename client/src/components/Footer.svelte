<script lang="ts">
  import { config, type SiteConfig } from '../lib/config.ts'
  import { href } from '../lib/router.svelte.ts'
  import { LANDINGS } from '../../../shared/site.ts'
  import { consent, needsBanner } from '../lib/consent.svelte.ts'

  let { onshortcuts }: { onshortcuts?: () => void } = $props()

  let site = $state<SiteConfig | null>(null)
  void config.then(c => (site = c))
</script>

<footer>
  <div class="inner">
    <div class="brand">
      <b>pip</b>
      <span>Free chess coaching. No paywalls, no accounts.</span>
    </div>
    <nav>
      <a href={href('/about')}>About & FAQ</a>
      <a href={href('/privacy')}>Privacy</a>
      {#if onshortcuts}<button onclick={onshortcuts}>Shortcuts</button>{/if}
      {#if needsBanner(site)}<button onclick={() => (consent.open = true)}>Privacy choices</button>{/if}
      {#if site?.support}
        <a class="support" href={site.support.url} target="_blank" rel="noopener">
          <svg viewBox="0 0 20 20" width="16" height="16"><path d="M10 16.5S3.5 12.6 3.5 8a3.5 3.5 0 0 1 6.5-1.8A3.5 3.5 0 0 1 16.5 8c0 4.6-6.5 8.5-6.5 8.5z" /></svg>
          {site.support.label}
        </a>
      {/if}
    </nav>
    <nav class="more" aria-label="Guides">
      {#each LANDINGS.slice(1) as l}<a href={l.path}>{l.label}</a>{/each}
    </nav>
    <p class="credits">Analysis by Stockfish. Human move model Maia-3 by the CSSLab. Puzzles from the Lichess database. Not affiliated with chess.com or Lichess.</p>
  </div>
</footer>

<style>
  footer {
    border-top: 2px solid var(--line);
    margin-top: 40px;
  }
  .inner {
    width: min(1000px, 100%);
    margin: 0 auto;
    padding: 30px 24px 40px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 14px 24px;
    align-items: center;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 12px;
    color: var(--dim);
    font-size: 15px;
  }
  .brand b {
    color: var(--accent);
    font-size: 22px;
    font-weight: 900;
  }
  nav {
    display: flex;
    gap: 20px;
    align-items: center;
  }
  nav a,
  nav button {
    color: var(--dim);
    text-decoration: none;
    font-weight: 800;
    font-size: 14.5px;
    transition: color 0.15s;
  }
  nav a:hover,
  nav button:hover {
    color: var(--text);
  }
  .support {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent) !important;
  }
  .support svg {
    fill: var(--accent);
  }
  .more {
    grid-column: 1 / -1;
    flex-wrap: wrap;
    gap: 6px 18px;
  }
  .more a {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--faint);
  }
  .credits {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 13px;
    color: var(--faint);
  }
  @media (max-width: 760px) {
    .inner {
      grid-template-columns: 1fr;
      padding-bottom: 110px;
    }
    nav {
      flex-wrap: wrap;
    }
  }
</style>
