<script module lang="ts">
  const CLOCK = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2'
  const SHIELD = 'M12 3l7 3v5.5c0 4.6-3 7.8-7 9.5-4-1.7-7-4.9-7-9.5V6z'
  const CROWN = 'M5 18.5h14M6 18.5L4.5 8.5l4.5 3.5 3-6 3 6 4.5-3.5-1.5 10'
  const RISE = 'M4 20h16M7.5 16v-5M12 16V6.5M16.5 16v-8'

  export const ICONS: Record<string, string> = {
    mate: CROWN,
    backRank: 'M3 19.5h18M8 15.5h8M9 15.5l-.5-5h7l-.5 5M12 4.5v4M10 6.5h4',
    hanging: 'M12 3.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM9.5 9.5L8 17h8l-1.5-7.5M6.5 20.5h11M19 4v4M19 11v.1',
    fork: 'M12 20.5v-8M12 12.5L6.5 5M12 12.5L17.5 5M6.5 5h.1M17.5 5h.1M12 20.5h.1',
    pin: 'M9 3.5h6l-1 5.5 3.5 3.5h-11L10 9zM12 12.5v8',
    skewer: 'M3 12h17M17 8.5l3.5 3.5-3.5 3.5M8 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM13.5 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
    discovered: 'M4 20l6-6M13 11l7-7M15 4h5v5M7.5 9.5l7 7',
    defender: `${SHIELD}M7.5 7.5l9 9`,
    trapped: 'M4.5 4.5h15v15h-15zM9.5 4.5v15M14.5 4.5v15M12 10v4',
    promotion: 'M12 20V6M6.5 11.5L12 6l5.5 5.5M8 20.5h8',
    intermezzo: 'M13.5 3L6 13.5h5.5L10 21l8-10.5h-5.5z',
    kingSafety: `${SHIELD}M12 8v6M9.5 10.5h5`,
    structure: 'M6 18.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM12 13.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM18 8.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM7.5 15l3-2.5M13.5 10l3-2.5',
    activity: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
    development: RISE,
    develop: RISE,
    endgame: 'M6 21V3.5M6 4h11.5l-2.5 4 2.5 4H6',
    time: CLOCK,
    tempo: CLOCK,
    'opening-clock': CLOCK,
    castle: 'M5.5 20.5h13M7 20.5V10h10v10.5M7 10V5h2.2v2h2.6V5h2.4v2h2.6V5H17v5M10.5 20.5v-4h3v4',
    queen: CROWN,
    repeats: 'M4.5 11a7.5 7.5 0 0 1 13.4-4.6M19.5 3.5v4h-4M19.5 13a7.5 7.5 0 0 1-13.4 4.6M4.5 20.5v-4h4',
    shield: `${SHIELD}M12 7.5l-2 4h4l-2 4`,
    relax: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.1M15 9.5h.1',
    threats: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    chances: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.1',
    conversion: 'M8 3.5h8v5.5a4 4 0 0 1-8 0zM8 5H5a3 3 0 0 0 3.5 4.5M16 5h3a3 3 0 0 1-3.5 4.5M12 13v4M8 20.5h8',
    defense: SHIELD,
    bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  }
</script>

<script lang="ts">
  let { name, size = 24 }: { name: string; size?: number } = $props()
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={ICONS[name] ?? ICONS.chances} /></svg>

<style>
  svg {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
