export type Route =
  | { name: 'games' }
  | { name: 'game'; id: string }
  | { name: 'insights' }
  | { name: 'train'; theme: string | null }
  | { name: 'openings'; color: 'white' | 'black' }
  | { name: 'play' }
  | { name: 'about' }
  | { name: 'privacy' }
  | { name: 'shared'; id: string }

const parse = (path: string, search: string): Route => {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const params = new URLSearchParams(search)
  switch (parts[0]) {
    case 'game':
      return parts[1] ? { name: 'game', id: parts[1] } : { name: 'games' }
    case 'r':
      return parts[1] ? { name: 'shared', id: parts[1] } : { name: 'games' }
    case 'insights':
      return { name: 'insights' }
    case 'train':
      return { name: 'train', theme: params.get('theme') }
    case 'openings':
      return { name: 'openings', color: parts[1] === 'black' ? 'black' : 'white' }
    case 'play':
      return { name: 'play' }
    case 'about':
      return { name: 'about' }
    case 'privacy':
      return { name: 'privacy' }
    default:
      return { name: 'games' }
  }
}

const legacy = location.hash.startsWith('#/') ? location.hash.slice(1) : null
if (legacy) history.replaceState(null, '', legacy)

export const router = $state({ route: parse(location.pathname, location.search) })

const update = () => {
  router.route = parse(location.pathname, location.search)
}

export const go = (path: string, replace = false) => {
  if (path === location.pathname + location.search) return
  if (replace) history.replaceState(null, '', path)
  else history.pushState(null, '', path)
  update()
  scrollTo({ top: 0 })
}

export const href = (path: string) => path

export const here = () => location.pathname

addEventListener('popstate', update)

addEventListener('click', e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const link = (e.target as HTMLElement).closest('a')
  if (!link || link.target || link.hasAttribute('download') || link.origin !== location.origin) return
  if (/\.[a-z0-9]+$/i.test(link.pathname)) return
  e.preventDefault()
  go(link.pathname + link.search)
})
