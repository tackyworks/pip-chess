<script lang="ts">
  import { config, type Placement, type SiteConfig } from '../lib/config.ts'
  import { adsAllowed } from '../lib/consent.svelte.ts'

  let { placement }: { placement: Placement } = $props()

  let site = $state<SiteConfig | null>(null)
  let slot: HTMLElement | undefined = $state()

  void config.then(c => (site = c))

  const house = $derived(site?.sponsor?.[placement] ?? null)
  const adsense = $derived(adsAllowed(site) && site?.adsense?.slots[placement] ? { client: site.adsense.client, slot: site.adsense.slots[placement]! } : null)

  $effect(() => {
    if (!adsense || !slot) return
    const id = 'adsense-script'
    if (!document.getElementById(id)) {
      const s = document.createElement('script')
      s.id = id
      s.async = true
      s.crossOrigin = 'anonymous'
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense.client}`
      document.head.append(s)
    }
    try {
      ;((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({})
    } catch {}
  })
</script>

{#if house}
  <a class="sponsor card" href={house.url} target="_blank" rel="sponsored noopener">
    {#if house.image}<img src={house.image} alt="" width="56" height="56" loading="lazy" />{/if}
    <span class="body">
      <span class="tag">Sponsored</span>
      <b>{house.title}</b>
      <span class="text">{house.text}</span>
    </span>
    <span class="cta">{house.cta}</span>
  </a>
{:else if adsense}
  <div class="sponsor card ad" bind:this={slot}>
    <span class="tag">Sponsored</span>
    <ins class="adsbygoogle" style="display:block" data-ad-client={adsense.client} data-ad-slot={adsense.slot} data-ad-format="auto" data-full-width-responsive="true"></ins>
  </div>
{/if}

<style>
  .sponsor {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
    color: inherit;
    text-decoration: none;
    background: var(--bg);
    border-style: dashed;
    transition: border-color 0.15s;
  }
  .sponsor:hover {
    border-color: var(--line-2);
  }
  img {
    border-radius: 12px;
    object-fit: cover;
    flex: none;
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .tag {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .text {
    color: var(--dim);
    font-size: 14.5px;
  }
  .cta {
    flex: none;
    font-weight: 900;
    font-size: 13.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .ad {
    flex-direction: column;
    align-items: stretch;
    min-height: 120px;
  }
</style>
