<script lang="ts">
  import { Tween } from 'svelte/motion'
  import { cubicOut } from 'svelte/easing'

  let { value, decimals = 0 }: { value: number; decimals?: number } = $props()

  const shown = new Tween(0, { duration: 1100, easing: cubicOut })
  $effect(() => {
    shown.target = value
  })
</script>

<span class="num">{shown.current.toFixed(decimals)}</span>
