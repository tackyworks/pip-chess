import { legalUcis, position } from './chess.ts'
import { ASSETS } from './assets.ts'
import { cachedAll } from './download.ts'
import type { Role } from 'chessops/types'
import type { InferenceSession, Tensor } from 'onnxruntime-web'

export interface HumanQuery {
  fen: string
  elo: number
  oppo: number
}

export interface HumanView {
  policy: Map<string, number>
  wdl: [number, number, number]
}

const ROLE_INDEX: Record<Role, number> = { pawn: 0, knight: 1, bishop: 2, rook: 3, queen: 4, king: 5 }
const VOCAB = 4352
const BATCH = 128

const flip = (uci: string) => uci[0] + (9 - +uci[1]) + uci[2] + (9 - +uci[3]) + uci.slice(4)

const softmax = (values: ArrayLike<number>) => {
  let top = -Infinity
  for (let i = 0; i < values.length; i++) if (values[i] > top) top = values[i]
  const exps = Array.from(values, v => Math.exp(v - top))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map(e => e / sum)
}

export class Maia {
  #session: InferenceSession
  #tensor: typeof Tensor
  #vocab: Record<string, number>
  #queue: Promise<unknown> = Promise.resolve()

  private constructor(session: InferenceSession, tensor: typeof Tensor, vocab: Record<string, number>) {
    this.#session = session
    this.#tensor = tensor
    this.#vocab = vocab
  }

  static async load(onProgress?: (done: number, total: number) => void) {
    const [ort, [model, runtime], vocab] = await Promise.all([
      import(/* @vite-ignore */ ASSETS.ortRuntime) as Promise<typeof import('onnxruntime-web')>,
      cachedAll([ASSETS.maia, ASSETS.ortWasm], onProgress),
      fetch(ASSETS.maiaMoves).then(r => r.json()),
    ])
    ort.env.wasm.wasmPaths = ASSETS.ort
    ort.env.wasm.wasmBinary = runtime
    ort.env.wasm.numThreads = crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
    ort.env.logLevel = 'error'
    const gpu = 'gpu' in navigator
    const options = (providers: string[]): InferenceSession.SessionOptions => ({ executionProviders: providers, graphOptimizationLevel: 'basic', logSeverityLevel: 3 })
    const session = await (gpu ? ort.InferenceSession.create(model, options(['webgpu'])) : Promise.reject()).catch(() =>
      ort.InferenceSession.create(model, options(['wasm'])),
    )
    return new Maia(session, ort.Tensor, vocab)
  }

  #encode(fen: string, tokens: Float32Array, offset: number) {
    const pos = position(fen)
    const white = pos.turn === 'white'
    for (const [sq, piece] of pos.board) tokens[offset + (white ? sq : sq ^ 56) * 12 + (piece.color === pos.turn ? 0 : 6) + ROLE_INDEX[piece.role]] = 1
    return { white, moves: legalUcis(pos) }
  }

  predict(queries: HumanQuery[]) {
    const run = this.#queue.then(() => this.#predict(queries))
    this.#queue = run.catch(() => undefined)
    return run
  }

  async #predict(queries: HumanQuery[]): Promise<HumanView[]> {
    const out: HumanView[] = []
    for (let start = 0; start < queries.length; start += BATCH) {
      const chunk = queries.slice(start, start + BATCH)
      const n = chunk.length
      const tokens = new Float32Array(n * 768)
      const meta = chunk.map((q, i) => this.#encode(q.fen, tokens, i * 768))
      const result = await this.#session.run({
        tokens: new this.#tensor('float32', tokens, [n, 64, 12]),
        elo_self: new this.#tensor('float32', Float32Array.from(chunk, q => q.elo), [n]),
        elo_oppo: new this.#tensor('float32', Float32Array.from(chunk, q => q.oppo), [n]),
      })
      const logits = (await result.logits_move.getData()) as Float32Array
      const values = (await result.logits_value.getData()) as Float32Array
      meta.forEach(({ white, moves }, i) => {
        const scored = moves.map(uci => {
          const index = this.#vocab[white ? uci : flip(uci)]
          return index === undefined ? -Infinity : logits[i * VOCAB + index]
        })
        const probs = moves.length ? softmax(scored) : []
        const [l, d, w] = softmax(values.subarray(i * 3, i * 3 + 3))
        out.push({ policy: new Map(moves.map((uci, k) => [uci, probs[k]])), wdl: [w, d, l] })
      })
    }
    return out
  }
}
