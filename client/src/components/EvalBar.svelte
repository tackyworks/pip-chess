<script lang="ts">
  let { white, text = '', orientation = 'white', pending = false }: { white: number; text?: string; orientation?: 'white' | 'black'; pending?: boolean } = $props()
  const share = $derived(Math.min(0.97, Math.max(0.03, white)))
  const winning = $derived(white >= 0.5 ? 'white' : 'black')
</script>

<div class="bar" class:flip={orientation === 'black'} class:pending>
  <div class="fill" style="height: {share * 100}%"></div>
  <div class="mid"></div>
  {#if text}
    <span class="text num" class:top={(winning === 'white') === (orientation === 'black')} class:light={winning === 'white'}>{text}</span>
  {/if}
</div>

<style>
  .bar {
    position: relative;
    width: 16px;
    height: 100%;
    border-radius: 8px;
    background: #050505;
    overflow: hidden;
    display: flex;
    flex-direction: column-reverse;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.3);
  }
  .bar.flip {
    flex-direction: column;
  }
  .fill {
    background: linear-gradient(#f7f3ea, #ddd5c7);
    transition: height 0.55s var(--ease);
  }
  .pending .fill {
    opacity: 0.55;
  }
  .mid {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
    background: rgb(242 181 68 / 0.75);
  }
  .text {
    position: absolute;
    left: 50%;
    bottom: 6px;
    transform: translateX(-50%) rotate(-90deg);
    transform-origin: center;
    font-size: 10.5px;
    font-weight: 900;
    white-space: nowrap;
    color: #f7f3ea;
    width: 0;
    display: flex;
    justify-content: flex-start;
    flex-direction: row-reverse;
  }
  .text.light {
    color: #1a1714;
  }
  .text.top {
    bottom: auto;
    top: 6px;
    flex-direction: row;
  }
</style>
