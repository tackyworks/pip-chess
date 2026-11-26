<script module lang="ts">
  import { api } from '../lib/api.ts'

  const TONES = [
    ['#f2b544', '#c48b23'],
    ['#ec8a3c', '#c26a24'],
    ['#e5574d', '#b93f37'],
    ['#b48ee8', '#8f69c4'],
    ['#c49a6c', '#9d774f'],
    ['#e0739c', '#b8577b'],
    ['#8f8a80', '#6c675f'],
    ['#d9a441', '#ad7f27'],
  ]
  const failed = new Set<string>()
  const urls = new Map<string, Promise<string | null>>()
  const urlOf = (key: string) => {
    let job = urls.get(key)
    if (!job) urls.set(key, (job = api.avatar(key).catch(() => null)))
    return job
  }

  const toneOf = (name: string) => {
    let h = 0
    for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return TONES[h % TONES.length]
  }
</script>

<script lang="ts">
  import Pip from './Pip.svelte'

  let { name, size = 36, mascot = false }: { name: string; size?: number; mascot?: boolean } = $props()

  const key = $derived(name.toLowerCase())
  const usable = $derived(/^[\w-]{2,30}$/.test(name))
  let broken = $state(false)
  let loaded = $state(false)
  let src = $state<string | null>(null)
  const show = $derived(!mascot && usable && !broken && !failed.has(key) && !!src)
  const tone = $derived(toneOf(name))

  $effect(() => {
    const k = key
    src = null
    loaded = false
    if (mascot || !usable) return
    void urlOf(k).then(url => {
      if (k === key) src = url
    })
  })
</script>

<span class="avatar" class:mascot style="--s: {size}px; --c: {tone[0]}; --d: {tone[1]}">
  {#if mascot}
    <Pip mood="idle" size={size * 0.82} />
  {:else}
    <span class="initial">{name.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase() || '?'}</span>
  {/if}
  {#if show}
    <img
      class:loaded
      {src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerpolicy="no-referrer"
      decoding="async"
      onload={() => (loaded = true)}
      onerror={() => {
        failed.add(key)
        broken = true
      }}
    />
  {/if}
</span>

<style>
  .avatar {
    position: relative;
    width: var(--s);
    height: var(--s);
    flex: none;
    border-radius: 30%;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: var(--c);
    box-shadow: inset 0 -3px 0 var(--d);
  }
  .mascot {
    background: var(--panel-2);
    box-shadow: inset 0 -3px 0 var(--line-2);
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0;
    transition: opacity 0.2s;
  }
  img.loaded {
    opacity: 1;
  }
  .initial {
    color: #fff;
    font-weight: 900;
    font-size: calc(var(--s) * 0.46);
    line-height: 1;
    margin-top: -2px;
  }
</style>
