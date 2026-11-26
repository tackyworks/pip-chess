<script lang="ts">
  import { fade, fly } from 'svelte/transition'

  let { link, title, onclose }: { link: string; title: string; onclose: () => void } = $props()

  let copied = $state(false)
  let field: HTMLInputElement | undefined = $state()

  const image = $derived(link.replace('/r/', '/og/') + '.png')
  const text = $derived(`${title}, reviewed by Pip`)
  const targets = $derived([
    { name: 'X', url: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}` },
    { name: 'Reddit', url: `https://www.reddit.com/submit?url=${encodeURIComponent(link)}&title=${encodeURIComponent(text)}` },
    { name: 'WhatsApp', url: `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}` },
  ])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      copied = true
    } catch {
      field?.select()
    }
  }
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && onclose()} />

<div class="scrim" transition:fade={{ duration: 150 }}>
  <button class="backdrop" aria-label="Close" onclick={onclose}></button>
  <div class="sheet card" role="dialog" aria-modal="true" aria-label="Share review" transition:fly={{ y: 16, duration: 240 }}>
    <h2>Share this review</h2>
    <img src={image} alt="Preview card for this review" width="1200" height="630" />
    <div class="row">
      <input bind:this={field} value={link} readonly onfocus={e => (e.currentTarget as HTMLInputElement).select()} aria-label="Review link" />
      <button class="btn primary" onclick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>
    <div class="targets">
      {#each targets as t}<a class="btn ghost" href={t.url} target="_blank" rel="noopener">{t.name}</a>{/each}
      <span class="grow"></span>
      <button class="btn ghost" onclick={onclose}>Done</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: grid;
    place-items: center;
    padding: 20px;
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
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--panel);
  }
  h2 {
    margin: 0;
    font-size: 24px;
  }
  img {
    width: 100%;
    height: auto;
    border-radius: 14px;
    border: 2px solid var(--line);
    background: var(--bg);
  }
  .row {
    display: flex;
    gap: 10px;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 46px;
    padding: 0 14px;
    border-radius: 14px;
    border: 2px solid var(--line);
    background: var(--bg);
    font-weight: 700;
    color: var(--text);
    outline: 0;
  }
  input:focus {
    border-color: var(--accent);
  }
  .targets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .targets .btn {
    height: 40px;
    padding: 0 16px;
    font-size: 13px;
  }
  .grow {
    flex: 1;
  }
</style>
