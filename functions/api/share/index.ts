const MAX_REVIEW = 700_000
const MAX_CARD = 1_500_000
const YEAR = 60 * 60 * 24 * 365
const PNG = [0x89, 0x50, 0x4e, 0x47]
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'

const fail = (status: number, message: string) => new Response(message, { status })

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => ALPHABET[b % ALPHABET.length]).join('')

interface Payload {
  game?: { white?: { name?: string }; black?: { name?: string }; result?: string; opening?: string | null }
  review?: { opening?: { name?: string } | null; white?: { accuracy?: number }; black?: { accuracy?: number } } | null
  line?: { moves?: unknown[] }
}

const describe = (data: Payload): ShareMeta => {
  const white = data.game?.white?.name ?? 'White'
  const black = data.game?.black?.name ?? 'Black'
  const opening = data.review?.opening?.name ?? data.game?.opening ?? 'Chess game'
  const acc = (n?: number) => (typeof n === 'number' ? `${n.toFixed(1)}%` : '–')
  return {
    title: `${white} vs ${black} · ${opening}`.slice(0, 140),
    description: `Accuracy ${white} ${acc(data.review?.white?.accuracy)}, ${black} ${acc(data.review?.black?.accuracy)}. Every move reviewed and explained by Pip, the free chess coach.`.slice(0, 300),
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_REVIEW + MAX_CARD + 10_000) return fail(413, 'That review is too large to share.')
  const form = await request.formData().catch(() => null)
  const review = form?.get('review')
  const card = form?.get('card')
  if (typeof review !== 'string' || !card || typeof card === 'string') return fail(400, 'Missing review or card.')
  if (review.length > MAX_REVIEW || card.size > MAX_CARD) return fail(413, 'That review is too large to share.')
  const bytes = new Uint8Array(await card.arrayBuffer())
  if (!PNG.every((b, i) => bytes[i] === b)) return fail(400, 'The card must be a PNG.')
  let data: Payload
  try {
    data = JSON.parse(review)
  } catch {
    return fail(400, 'The review is not valid JSON.')
  }
  if (!data.game || !data.review || !Array.isArray(data.line?.moves)) return fail(400, 'That is not a Pip review.')
  const id = newId()
  const meta = describe(data)
  await Promise.all([
    env.SHARES.put(`r:${id}`, review, { expirationTtl: 2 * YEAR, metadata: meta }),
    env.SHARES.put(`c:${id}`, bytes, { expirationTtl: 2 * YEAR }),
  ])
  return Response.json({ id })
}
