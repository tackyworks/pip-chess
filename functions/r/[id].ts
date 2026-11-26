const attr = (value: string) => ({ element: (el: Element) => void el.setAttribute('content', value) })

export const onRequestGet: PagesFunction<Env, 'id'> = async ({ params, env, request }) => {
  const id = String(params.id)
  const origin = new URL(request.url).origin
  const [page, found] = await Promise.all([
    env.ASSETS.fetch(new URL('/', request.url)),
    env.SHARES.getWithMetadata<ShareMeta>(`r:${id}`, 'stream'),
  ])
  const meta = found.metadata
  if (!found.value || !meta) return new Response(page.body, { status: 404, headers: page.headers })
  void found.value.cancel()
  const url = `${origin}/r/${id}`
  const image = `${origin}/og/${id}.png`
  const description = meta.description
  const title = `${meta.title} · Pip`
  return new HTMLRewriter()
    .on('title', { element: el => void el.setInnerContent(title) })
    .on('meta[name="description"]', attr(description))
    .on('meta[property="og:title"]', attr(title))
    .on('meta[property="og:description"]', attr(description))
    .on('meta[property="og:url"]', attr(url))
    .on('meta[property="og:image"]', attr(image))
    .on('meta[property="og:type"]', attr('article'))
    .on('link[rel="canonical"]', { element: el => void el.setAttribute('href', url) })
    .on('script[type="application/ld+json"]', { element: el => void el.remove() })
    .on('head', { element: el => void el.append('<meta name="robots" content="noindex" />', { html: true }) })
    .on('main.seo h1', { element: el => void el.setInnerContent(meta.title) })
    .on('main.seo .seo-lead', { element: el => void el.setInnerContent(description) })
    .transform(new Response(page.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } }))
}
