import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { FAQ, FEATURES, LANDINGS, type Landing } from '../shared/site.ts'

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (text: string) => text.replace(/[&<>"]/g, c => ENTITIES[c])

const HEAD = /<!--seo:head-->[\s\S]*?<!--\/seo:head-->/
const BODY = /<!--seo:body-->[\s\S]*?<!--\/seo:body-->/

const LINKS: [string, string][] = [...LANDINGS.slice(1).map(l => [l.path, l.label] as [string, string]), ['/about', 'About & FAQ'], ['/privacy', 'Privacy']]

const structured = (site: string, page: Landing) => ({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: 'Pip', url: `${site}/`, description: LANDINGS[0].description },
    {
      '@type': 'WebApplication',
      name: 'Pip',
      url: `${site}${page.path}`,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires a modern browser with WebAssembly',
      description: page.description,
      image: `${site}/og.png`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: FEATURES.map(([title]) => title),
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ],
})

const head = (site: string, page: Landing) => {
  const url = `${site}${page.path}`
  return `<!--seo:head-->
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:site_name" content="Pip" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:image" content="${site}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${JSON.stringify(structured(site, page)).replace(/</g, '\\u003c')}</script>
    <!--/seo:head-->`
}

const body = (page: Landing) => {
  const [pre, em, post] = page.headline.map(esc)
  return `<!--seo:body-->
      <main class="seo">
        <b class="seo-brand">pip</b>
        <h1>${pre}<em>${em}</em>${post}</h1>
        <p class="seo-lead">${esc(page.lead)}</p>
        <p><a class="seo-cta" href="/">Review my games, free</a></p>
        <h2>What Pip does</h2>
        <ul>${FEATURES.map(([t, d]) => `<li><b>${esc(t)}.</b> ${esc(d)}</li>`).join('')}</ul>
        <h2>Questions</h2>
        ${FAQ.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
        <nav>${LINKS.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join(' · ')}</nav>
        <p class="seo-fine">Free chess coaching with Stockfish 19 and Maia-3. Not affiliated with chess.com or Lichess.</p>
      </main>
      <!--/seo:body-->`
}

const render = (html: string, site: string, page: Landing) => html.replace(HEAD, head(site, page)).replace(BODY, body(page))

const sitemap = (site: string) => {
  const today = new Date().toISOString().slice(0, 10)
  const paths = [...LANDINGS.map(l => l.path), '/about', '/privacy']
  const urls = paths.map(p => `  <url><loc>${site}${p}</loc><lastmod>${today}</lastmod><priority>${p === '/' ? '1.0' : '0.7'}</priority></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

export const seo = (site: string): Plugin => {
  let out = ''
  return {
    name: 'pip-seo',
    configResolved: config => void (out = resolve(config.root, config.build.outDir)),
    transformIndexHtml: html => render(html, site, LANDINGS[0]),
    closeBundle() {
      const index = join(out, 'index.html')
      if (!existsSync(index)) return
      const html = readFileSync(index, 'utf8')
      for (const page of LANDINGS.slice(1)) writeFileSync(join(out, `${page.path.slice(1)}.html`), render(html, site, page))
      writeFileSync(join(out, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml
`)
      writeFileSync(join(out, 'sitemap.xml'), sitemap(site))
    },
  }
}
