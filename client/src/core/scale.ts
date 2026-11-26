import { fromHuman, toHuman } from '../../../shared/rating.ts'

export type Site = 'chesscom' | 'lichess'

let current: Site = 'chesscom'

export const setSite = (site: Site) => {
  current = site
}

export const site = () => current

export const toModel = (rating: number) => (current === 'lichess' ? Math.round(Math.min(2900, Math.max(700, rating))) : toHuman(rating))

export const fromModel = (rating: number) => (current === 'lichess' ? Math.round(rating / 10) * 10 : fromHuman(rating))
