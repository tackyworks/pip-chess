import { Uci, type SearchSpec } from './uci.ts'
import type { Line } from '../../../../shared/types.ts'

const OPTIONS = { Threads: 1, Hash: 32 }

export class Solo {
  #path: string
  #uci: Uci
  #chain: Promise<unknown> = Promise.resolve()

  private constructor(path: string, uci: Uci) {
    this.#path = path
    this.#uci = uci
  }

  static async start(path: string) {
    return new Solo(path, await Uci.start(path, OPTIONS))
  }

  search(spec: SearchSpec): Promise<Line[]> {
    const run = this.#chain.then(async () => {
      if (this.#uci.dead) this.#uci = await Uci.start(this.#path, OPTIONS)
      return this.#uci.search(spec)
    })
    this.#chain = run.catch(() => undefined)
    return run
  }

  stop() {
    this.#uci.quit()
  }
}
