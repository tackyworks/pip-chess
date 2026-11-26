export const onRequestGet: PagesFunction<Env, 'id'> = async ({ params, env }) => {
  const id = String(params.id)
  const body = await env.SHARES.get(`r:${id}`, 'stream')
  if (!body) return new Response('Not found', { status: 404 })
  return new Response(body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400, immutable' },
  })
}
