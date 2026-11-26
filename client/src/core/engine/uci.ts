import type { Line } from '../../../../shared/types.ts'

export interface SearchSpec {
  fen: string
  nodes: number
  multipv: number
}

export const expected = (cp?: number, mate?: number) =>
  mate !== undefined ? (mate > 0 ? 1 : 0) : 1 / (1 + Math.exp(-0.00368208 * (cp ?? 0)))

const parseInfo = (text: string) => {
  const t = text.split(' ')
  let depth = 0
  let multipv = 1
  let cp: number | undefined
  let mate: number | undefined
  let pv: string[] = []
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': depth = +t[++i]; break
      case 'multipv': multipv = +t[++i]; break
      case 'score':
        if (t[i + 1] === 'cp') cp = +t[i + 2]
        else mate = +t[i + 2]
        i += 2
        break
      case 'lowerbound': case 'upperbound': return null
      case 'pv': pv = t.slice(i + 1); i = t.length; break
    }
  }
  if (!pv.length || (cp === undefined && mate === undefined)) return null
  const line: Line = { uci: pv[0], ep: expected(cp, mate), depth, pv }
  if (cp !== undefined) line.cp = cp
  if (mate !== undefined) line.mate = mate
  return { multipv, line }
}

export class Uci {
  #worker: Worker
  #wait: ((line: string) => boolean) | null = null
  #fail: ((error: Error) => void) | null = null
  #lines = new Map<number, Line>()
  #multipv = 0
  #dead = false

  private constructor(url: string) {
    this.#worker = new Worker(url)
    this.#worker.onmessage = (e: MessageEvent) => {
      if (this.#wait?.(String(e.data))) {
        this.#wait = null
        this.#fail = null
      }
    }
    this.#worker.onerror = () => {
      this.#dead = true
      this.#fail?.(new Error('engine crashed'))
    }
  }

  static async start(url: string, options: Record<string, string | number>) {
    const uci = new Uci(url)
    await uci.#until('uci', line => line === 'uciok')
    for (const [name, value] of Object.entries(options)) uci.#send(`setoption name ${name} value ${value}`)
    await uci.ready()
    return uci
  }

  get dead() {
    return this.#dead
  }

  #send(command: string) {
    if (!this.#dead) this.#worker.postMessage(command)
  }

  #until(command: string, done: (line: string) => boolean) {
    return new Promise<void>((resolve, reject) => {
      if (this.#dead) return reject(new Error('engine stopped'))
      this.#fail = reject
      this.#wait = line => done(line) && (resolve(), true)
      this.#send(command)
    })
  }

  ready() {
    return this.#until('isready', line => line === 'readyok')
  }

  async search({ fen, nodes, multipv }: SearchSpec): Promise<Line[]> {
    if (multipv !== this.#multipv) {
      this.#send(`setoption name MultiPV value ${multipv}`)
      this.#multipv = multipv
    }
    this.#lines.clear()
    this.#send(`position fen ${fen}`)
    await this.#until(`go nodes ${nodes}`, text => {
      if (text.startsWith('info') && text.includes(' pv ')) {
        const info = parseInfo(text)
        if (info) this.#lines.set(info.multipv, info.line)
        return false
      }
      return text.startsWith('bestmove')
    })
    return [...this.#lines.entries()].sort((a, b) => a[0] - b[0]).map(([, line]) => line)
  }

  quit() {
    this.#dead = true
    this.#worker.terminate()
  }
}
