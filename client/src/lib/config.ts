export interface Sponsor {
  title: string
  text: string
  url: string
  cta: string
  image?: string
}

export interface SiteConfig {
  support: { label: string; url: string } | null
  sponsor: Partial<Record<Placement, Sponsor>> | null
  adsense: { client: string; cmp?: 'google' | 'pip'; slots: Partial<Record<Placement, string>> } | null
}

export type Placement = 'games' | 'insights' | 'trained' | 'review'

const empty: SiteConfig = { support: null, sponsor: null, adsense: null }

export const config: Promise<SiteConfig> = fetch('/config.json')
  .then(r => (r.ok ? r.json() : empty))
  .then(c => ({ ...empty, ...c }))
  .catch(() => empty)
