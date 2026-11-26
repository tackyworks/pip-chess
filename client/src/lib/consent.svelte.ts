import type { SiteConfig } from './config.ts'

type Choice = 'granted' | 'denied' | null

const KEY = 'pip.consent'

const stored = (): Choice => {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

export const consent = $state({ choice: stored(), open: false })

export const decide = (choice: 'granted' | 'denied') => {
  consent.choice = choice
  consent.open = false
  try {
    localStorage.setItem(KEY, choice)
  } catch {}
  if (choice === 'denied' && document.getElementById('adsense-script')) location.reload()
}

export const needsBanner = (site: SiteConfig | null) => !!site?.adsense && site.adsense.cmp !== 'google'

export const adsAllowed = (site: SiteConfig | null) => !!site?.adsense && (site.adsense.cmp === 'google' || consent.choice === 'granted')
