import { Uci } from './uci.ts'
import type { Line } from '../../../../shared/types.ts'

export interface RunOptions {
  nodes: number
  multipv: number
  priority: number
  group: string
  onResult?: (index: number, lines: Line[]) => void
}

interface Job extends RunOptions {
  seq: number
  fens: string[]
  lanes: number[][]
  results: Line[][]
  left: number
  tries: Map<number, number>
  resolve: (results: Line[][]) => void
  reject: (error: Error) => void
}

interface Worker {
  id: number
  uci: Uci
  busy: boolean
}

const config = () => {
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  return { workers: Math.max(1, Math.min(cores - 2, Math.floor(memory / 1.5), 6)), threads: 1, hash: 32 }
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i)

export class Pool {
  #path: string
  #options: Record<string, number>
  #workers: Worker[] = []
  #jobs: Job[] = []
  #seq = 0

  private constructor(path: string, options: Record<string, number>) {
    this.#path = path
    this.#options = options
  }

  static async start(path: string) {
    const { workers, threads, hash } = config()
    const pool = new Pool(path, { Threads: threads, Hash: hash })
    pool.#workers = await Promise.all(range(0, workers).map(async id => ({ id, uci: await Uci.start(path, pool.#options), busy: false })))
    return pool
  }

  get size() {
    return this.#workers.length
  }

  run(fens: string[], options: RunOptions) {
    if (!fens.length) return Promise.resolve<Line[][]>([])
    return new Promise<Line[][]>((resolve, reject) => {
      const count = Math.min(this.#workers.length, fens.length)
      const size = Math.ceil(fens.length / count)
      this.#jobs.push({
        ...options,
        seq: this.#seq++,
        fens,
        lanes: range(0, count).map(l => range(l * size, Math.min(fens.length, (l + 1) * size))),
        results: new Array(fens.length),
        left: fens.length,
        tries: new Map(),
        resolve,
        reject,
      })
      this.#pump()
    })
  }

  prioritize(group: string, priority: number) {
    for (const job of this.#jobs) if (job.group === group) job.priority = Math.max(job.priority, priority)
  }

  #pick(worker: Worker) {
    let job: Job | undefined
    for (const candidate of this.#jobs) {
      if (!candidate.lanes.some(lane => lane.length)) continue
      if (!job || candidate.priority > job.priority || (candidate.priority === job.priority && candidate.seq < job.seq)) job = candidate
    }
    if (!job) return null
    const own = job.lanes[worker.id % job.lanes.length]
    if (own.length) return { job, index: own.pop()! }
    const richest = job.lanes.reduce((a, b) => (b.length > a.length ? b : a))
    return { job, index: richest.shift()! }
  }

  #pump() {
    for (const worker of this.#workers) if (!worker.busy) void this.#drive(worker)
  }

  async #drive(worker: Worker) {
    const next = this.#pick(worker)
    if (!next) return
    const { job, index } = next
    worker.busy = true
    try {
      const lines = await worker.uci.search({ fen: job.fens[index], nodes: job.nodes, multipv: job.multipv })
      job.results[index] = lines
      job.onResult?.(index, lines)
      if (--job.left === 0) this.#finish(job)
    } catch (error) {
      const tries = (job.tries.get(index) ?? 0) + 1
      job.tries.set(index, tries)
      if (tries < 3) job.lanes[0].push(index)
      else this.#finish(job, error as Error)
      if (worker.uci.dead) worker.uci = await Uci.start(this.#path, this.#options)
    } finally {
      worker.busy = false
      this.#pump()
    }
  }

  cancel() {
    const jobs = this.#jobs
    this.#jobs = []
    for (const job of jobs) job.reject(new Error('cancelled'))
  }

  #finish(job: Job, error?: Error) {
    this.#jobs = this.#jobs.filter(j => j !== job)
    if (error) job.reject(error)
    else job.resolve(job.results)
  }

  stop() {
    for (const worker of this.#workers) worker.uci.quit()
  }
}
