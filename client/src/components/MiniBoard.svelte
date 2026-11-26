<script lang="ts">
  import { BOARDS, settings } from '../lib/settings.svelte.ts'
  import type { Color } from '../../../shared/types.ts'

  let { fen, orientation = 'white', last = null, size = 160 }: { fen: string; orientation?: Color; last?: string | null; size?: number } = $props()

  const colors = $derived(BOARDS[settings.board])
  const at = (square: string) => {
    const file = square.charCodeAt(0) - 97
    const rank = Number(square[1]) - 1
    return orientation === 'white' ? [file, 7 - rank] : [7 - file, rank]
  }
  const pieces = $derived.by(() => {
    const out: { x: number; y: number; name: string }[] = []
    fen.split(' ')[0].split('/').forEach((row, r) => {
      let file = 0
      for (const ch of row) {
        if (/\d/.test(ch)) {
          file += Number(ch)
          continue
        }
        const [x, y] = at(`${String.fromCharCode(97 + file)}${8 - r}`)
        out.push({ x, y, name: `${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toUpperCase()}` })
        file++
      }
    })
    return out
  })
  const marks = $derived(last ? [at(last.slice(0, 2)), at(last.slice(2, 4))] : [])
</script>

<svg viewBox="0 0 8 8" width={size} height={size} class="mini" aria-hidden="true">
  <rect width="8" height="8" fill={colors.light} />
  {#each Array.from({ length: 32 }, (_, i) => i) as i}
    {@const y = Math.floor(i / 4)}
    <rect x={(i % 4) * 2 + ((y + 1) % 2)} {y} width="1" height="1" fill={colors.dark} />
  {/each}
  {#each marks as [x, y]}<rect {x} {y} width="1" height="1" class="last" />{/each}
  {#each pieces as p}<image href="/pieces/{settings.pieces}/{p.name}.svg" x={p.x} y={p.y} width="1" height="1" />{/each}
</svg>

<style>
  .mini {
    display: block;
    border-radius: 12px;
    flex: none;
  }
  .last {
    fill: rgb(242 181 68 / 0.45);
  }
</style>
