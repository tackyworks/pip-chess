export const onRequestGet: PagesFunction<Env, 'id'> = async ({ params, env, request }) => {
  const id = String(params.id).replace(/\.png$/, '')
  const body = await env.SHARES.get(`c:${id}`, 'stream')
  if (!body) return env.ASSETS.fetch(new URL('/og.png', request.url))
  return new Response(body, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } })
}
