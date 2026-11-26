<script lang="ts">
  import Pip from '../components/Pip.svelte'

  let { moved, onclaim }: { moved: boolean; onclaim: () => void } = $props()
</script>

<div class="elsewhere">
  <Pip mood={moved ? 'sleep' : 'think'} size={120} />
  <h1>{moved ? 'Pip moved to another tab' : 'Pip is open in another tab'}</h1>
  <p>Your games and progress live in this browser, so Pip runs in one tab at a time.</p>
  <button class="btn primary" onclick={onclaim}>Use Pip here</button>
</div>

<style>
  .elsewhere {
    min-height: 100vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    padding: 24px;
    text-align: center;
  }
  h1 {
    margin: 10px 0 0;
    font-size: 28px;
  }
  p {
    margin: 0 0 10px;
    max-width: 400px;
    color: var(--dim);
    font-size: 16.5px;
    line-height: 1.5;
  }
</style>
