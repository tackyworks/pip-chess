import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { Readable, Transform, pipeline as streamPipeline } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createZstdDecompress } from 'node:zlib'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { Chess } from 'chessops/chess'
import { parseSan } from 'chessops/san'
import { makeFen } from 'chessops/fen'
import { PUZZLE_THEMES } from '../shared/themes.ts'
import { ENGINE, enginePart } from '../shared/engine.ts'

const root = join(import.meta.dirname, '..')
const at = (...parts: string[]) => join(root, ...parts)

const RAW = 'https://raw.githubusercontent.com'
const PUBLIC = at('client', 'public')
const sources = {
  vocab: `${RAW}/CSSLab/maia-platform-frontend/main/src/lib/engine/data/all_moves_maia3.json`,
  openings: `${RAW}/lichess-org/chess-openings/master`,
  pieces: `${RAW}/lichess-org/lila/master/public/piece`,
  puzzles: 'https://database.lichess.org/lichess_db_puzzle.csv.zst',
}

const PIECE_SETS = ['cburnett', 'merida']
const PIECES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']

const mb = (n: number) => (n / 1048576).toFixed(1)

const download = async (url: string, file: string, label = '') => {
  if (existsSync(file)) return false
  mkdirSync(dirname(file), { recursive: true })
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`${res.status} ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  let seen = 0
  let shown = 0
  const meter = new Transform({
    transform(chunk: Buffer, _, done) {
      seen += chunk.length
      if (label && seen - shown > 4194304) {
        shown = seen
        process.stdout.write(`\r  ${label} ${mb(seen)} / ${mb(total)} MB`)
      }
      done(null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(res.body as never), meter, createWriteStream(`${file}.part`))
  renameSync(`${file}.part`, file)
  if (label) process.stdout.write(`\r  ${label} ${mb(seen)} MB\x1b[K\n`)
  return true
}

const engine = async () => {
  const bin = (ext: string) => at('node_modules', 'stockfish', 'bin', `${ENGINE.name}.${ext}`)
  const out = join(PUBLIC, 'engine', `${ENGINE.name}.js`)
  mkdirSync(dirname(out), { recursive: true })
  copyFileSync(bin('js'), out)
  const wasm = readFileSync(bin('wasm'))
  const size = Math.ceil(wasm.length / ENGINE.parts)
  for (let i = 0; i < ENGINE.parts; i++) writeFileSync(join(PUBLIC, enginePart(i).slice(1)), wasm.subarray(i * size, (i + 1) * size))
}

const vocab = () => download(sources.vocab, join(PUBLIC, 'data', 'maia3-moves.json'))

const pieces = () =>
  Promise.all(PIECE_SETS.flatMap(set => PIECES.map(p => download(`${sources.pieces}/${set}/${p}.svg`, join(PUBLIC, 'pieces', set, `${p}.svg`)))))

const unframe = () => {
  let held = Buffer.alloc(0)
  let pass = 0
  return new Transform({
    transform(chunk: Buffer, _, done) {
      let buf = held.length ? Buffer.concat([held, chunk]) : chunk
      while (buf.length) {
        if (pass) {
          const n = Math.min(pass, buf.length)
          this.push(buf.subarray(0, n))
          buf = buf.subarray(n)
          pass -= n
          continue
        }
        if (buf.length < 12) break
        if ((buf.readUInt32LE(0) & 0xfffffff0) !== 0x184d2a50) {
          pass = Infinity
          continue
        }
        const size = buf.readUInt32LE(4)
        if (buf.length < 8 + size) break
        pass = size === 4 ? buf.readUInt32LE(8) : 0
        buf = buf.subarray(8 + size)
      }
      held = Buffer.from(buf)
      done()
    },
  })
}

const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

const openings = async () => {
  const out = join(PUBLIC, 'data', 'openings.json')
  if (existsSync(out)) return
  const book: Record<string, [string, string]> = {}
  for (const letter of 'abcde') {
    const text = await (await fetch(`${sources.openings}/${letter}.tsv`)).text()
    for (const line of text.split('\n').slice(1)) {
      const [eco, name, pgn] = line.split('\t')
      if (!pgn) continue
      const pos = Chess.default()
      for (const token of pgn.split(' ')) {
        if (!token || /^\d+\.$/.test(token)) continue
        const move = parseSan(pos, token)
        if (!move) break
        pos.play(move)
      }
      book[epd(makeFen(pos.toSetup()))] = [eco, name]
    }
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(book))
  console.log(`  openings ${Object.keys(book).length} positions`)
}

const puzzleDb = async () => {
  const file = at('data', 'puzzles.db')
  if (existsSync(file)) return file
  const zst = at('data', 'puzzles.csv.zst')
  await download(sources.puzzles, zst, 'puzzles')
  const tmp = `${file}.part`
  rmSync(tmp, { force: true })
  const db = new DatabaseSync(tmp)
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA page_size = 8192;
    CREATE TABLE puzzle (id TEXT PRIMARY KEY, fen TEXT NOT NULL, moves TEXT NOT NULL, rating INTEGER NOT NULL, popularity INTEGER NOT NULL, themes TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE theme (theme INTEGER NOT NULL, rating INTEGER NOT NULL, id TEXT NOT NULL, PRIMARY KEY (theme, rating, id)) WITHOUT ROWID;
  `)
  const themeIndex = new Map<string, number>(PUZZLE_THEMES.map((t, i) => [t, i]))
  const addPuzzle = db.prepare('INSERT INTO puzzle VALUES (?, ?, ?, ?, ?, ?)')
  const addTheme = db.prepare('INSERT INTO theme VALUES (?, ?, ?)')
  let failure: Error | null = null
  const csv = streamPipeline(createReadStream(zst), unframe(), createZstdDecompress(), (err: Error | null | undefined) => { failure = err ?? null })
  const lines = createInterface({ input: csv, crlfDelay: Infinity })
  let read = 0
  let kept = 0
  db.exec('BEGIN')
  for await (const line of lines) {
    if (read++ === 0) continue
    const [id, fen, moves, rating, deviation, popularity, plays, themes] = line.split(',')
    if (+deviation > 85 || +popularity < 80 || +plays < 300) continue
    const r = +rating
    addPuzzle.run(id, fen, moves, r, +popularity, themes)
    for (const theme of themes.split(' ')) {
      const t = themeIndex.get(theme)
      if (t !== undefined) addTheme.run(t, r, id)
    }
    if (++kept % 100000 === 0) process.stdout.write(`\r  puzzles imported ${kept.toLocaleString()} of ${read.toLocaleString()} read`)
  }
  db.exec('COMMIT')
  if (failure || kept === 0) {
    db.close()
    throw failure ?? new Error('no puzzles imported')
  }
  db.exec('VACUUM')
  db.close()
  renameSync(tmp, file)
  rmSync(zst, { force: true })
  process.stdout.write(`\r  puzzles ${kept.toLocaleString()} kept from ${read.toLocaleString()}\x1b[K\n`)
  return file
}

const SHARD = 120

const shards = async () => {
  const root = join(PUBLIC, 'puzzles')
  if (existsSync(join(root, 'fork', '15.json'))) return
  const db = new DatabaseSync(await puzzleDb(), { readOnly: true })
  const pick = db.prepare(
    `SELECT p.id, p.fen, p.moves, p.rating, p.themes FROM theme t JOIN puzzle p ON p.id = t.id
     WHERE t.theme = ? AND t.rating BETWEEN ? AND ? ORDER BY p.popularity DESC, random() LIMIT ?`,
  )
  let files = 0
  PUZZLE_THEMES.forEach((theme, index) => {
    for (let bucket = 4; bucket <= 30; bucket++) {
      const rows = pick.all(index, bucket * 100, bucket * 100 + 99, SHARD) as { id: string; fen: string; moves: string; rating: number; themes: string }[]
      if (!rows.length) continue
      const out = join(root, theme, `${bucket}.json`)
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, JSON.stringify(rows.map(r => [r.id, r.fen, r.moves, r.rating, r.themes])))
      files++
    }
  })
  db.close()
  console.log(`  ${files} puzzle shards`)
}

const step =async (name: string, run: () => Promise<unknown>) => {
  const t = performance.now()
  console.log(`· ${name}`)
  await run()
  console.log(`  done in ${((performance.now() - t) / 1000).toFixed(1)}s`)
}

await step('engine loader', engine)
await step('human model moves', vocab)
await step('piece sets', pieces)
await step('opening book', openings)
await step('puzzle shards', shards)
console.log('ready')
