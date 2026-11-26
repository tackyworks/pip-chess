const STORE = 'pip-assets-v1'

export const cachedFetch = async (url: string, onProgress?: (done: number, total: number) => void) => {
  const cache = 'caches' in self ? await caches.open(STORE) : null
  const hit = await cache?.match(url)
  if (hit) {
    const bytes = new Uint8Array(await hit.arrayBuffer())
    onProgress?.(bytes.length, bytes.length)
    return bytes
  }
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let done = 0
  for (;;) {
    const { value, done: end } = await reader.read()
    if (end) break
    parts.push(value)
    done += value.length
    onProgress?.(done, total)
  }
  const bytes = new Uint8Array(done)
  let at = 0
  for (const p of parts) {
    bytes.set(p, at)
    at += p.length
  }
  await cache?.put(url, new Response(bytes, { headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' } })).catch(() => undefined)
  return bytes
}

export const cachedAll = (urls: string[], onProgress?: (done: number, total: number) => void) => {
  const done = urls.map(() => 0)
  const total = urls.map(() => 0)
  const sum = (list: number[]) => list.reduce((a, b) => a + b, 0)
  return Promise.all(
    urls.map((url, i) =>
      cachedFetch(url, (d, t) => {
        done[i] = d
        total[i] = t
        onProgress?.(sum(done), sum(total))
      }),
    ),
  )
}

export const cachedBlobUrl = async (urls: string[], type: string, onProgress?: (done: number, total: number) => void) =>
  URL.createObjectURL(new Blob(await cachedAll(urls, onProgress) as BlobPart[], { type }))

export const prune = async (keep: string[]) => {
  if (!('caches' in self)) return
  const cache = await caches.open(STORE)
  const wanted = new Set(keep.map(url => new URL(url, location.origin).href))
  for (const request of await cache.keys()) if (!wanted.has(request.url)) await cache.delete(request)
}
