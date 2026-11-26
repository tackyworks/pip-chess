<script lang="ts">
  import Pip from '../components/Pip.svelte'
  import { FAQ } from '../../../shared/site.ts'
  import { consent, needsBanner } from '../lib/consent.svelte.ts'
  import { config, type SiteConfig } from '../lib/config.ts'

  let site = $state<SiteConfig | null>(null)
  void config.then(c => (site = c))

  let { page }: { page: 'about' | 'privacy' } = $props()

</script>

<div class="page">
  {#if page === 'about'}
    <header>
      <Pip mood="proud" size={96} />
      <div>
        <span class="label">About Pip</span>
        <h1>A chess coach that doesn't ask for your card.</h1>
      </div>
    </header>
    <p class="lead">Most chess sites put the useful parts of a game review behind a subscription. Pip does the whole thing for free: it reviews your games, explains your mistakes the way a coach would, finds the habits that cost you points and trains you on exactly those.</p>

    <section>
      <h2 class="label">Questions</h2>
      <div class="faq">
        {#each FAQ as [q, a]}
          <details class="card">
            <summary>{q}<span class="chev"></span></summary>
            <p>{a}</p>
          </details>
        {/each}
      </div>
    </section>

    <section>
      <h2 class="label">Built on open work</h2>
      <ul class="credits">
        <li><b>Stockfish 19</b> for analysis (GPL-3.0)</li>
        <li><b>Maia-3</b> human move model by the University of Toronto CSSLab (AGPL-3.0)</li>
        <li><b>Lichess</b> puzzle and opening databases (CC0)</li>
        <li><b>chessground</b> and <b>chessops</b> by the Lichess team (GPL-3.0)</li>
      </ul>
    </section>
  {:else}
    <header>
      <Pip mood="read" size={96} />
      <div>
        <span class="label">Privacy</span>
        <h1>Your games stay yours.</h1>
      </div>
    </header>
    <div class="prose">
      <p>Pip has no accounts and no sign-up. Your games, reviews, puzzles and progress are stored in your own browser, and the chess analysis runs on your own device. None of it is uploaded to a server.</p>
      <p>To fetch your games and profile pictures, Pip asks the public chess.com and Lichess APIs for data those sites already make public. Stockfish and the Maia-3 model are downloaded once from public file hosts and kept in your browser.</p>
      <p>If you share a review, the game and its review are stored so the link works for anyone who has it. Links expire after two years.</p>
      <p>Pip is paid for by a few clearly labelled ads, never on the board or in the middle of training. Ads from Google only load if you allow them, and Google may then use cookies to show and measure them. You can change your choice at any time.</p>
      <p>To delete everything Pip stores, sign out and clear this site's data in your browser settings.</p>
      {#if needsBanner(site)}<button class="btn" onclick={() => (consent.open = true)}>Privacy choices</button>{/if}
    </div>
  {/if}
</div>

<style>
  .page {
    width: min(820px, 100%);
    margin: 0 auto;
    padding: 46px 24px 30px;
    display: flex;
    flex-direction: column;
    gap: 30px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  h1 {
    font-size: 38px;
    line-height: 1.15;
    margin: 6px 0 0;
  }
  .lead,
  .prose p {
    font-size: 18px;
    line-height: 1.6;
    color: var(--dim);
    margin: 0;
  }
  .prose {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  h2 {
    margin: 0 0 14px;
  }
  .faq {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  details {
    padding: 0;
    overflow: hidden;
  }
  summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    font-weight: 900;
    font-size: 17px;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .chev {
    width: 10px;
    height: 10px;
    border-right: 3px solid var(--dim);
    border-bottom: 3px solid var(--dim);
    transform: rotate(45deg);
    transition: transform 0.2s var(--ease);
    flex: none;
  }
  details[open] .chev {
    transform: rotate(-135deg);
  }
  details p {
    margin: 0;
    padding: 0 20px 18px;
    color: var(--dim);
    font-size: 16px;
    line-height: 1.55;
  }
  .credits {
    margin: 0;
    padding-left: 20px;
    color: var(--dim);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 16px;
  }
  .credits b {
    color: var(--text);
  }
  @media (max-width: 640px) {
    header {
      flex-direction: column;
      align-items: flex-start;
    }
    h1 {
      font-size: 30px;
    }
  }
</style>
