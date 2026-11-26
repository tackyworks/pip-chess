import sqlite3InitModule, { type Database, type PreparedStatement, type SqlValue } from '@sqlite.org/sqlite-wasm'
import type { Card, Color, GameRow, Line, Review, Status } from '../../../shared/types.ts'

const USER_SCHEMA = `
  PRAGMA temp_store = MEMORY;


  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS game (
    id TEXT PRIMARY KEY,
    url TEXT,
    pgn TEXT NOT NULL,
    white TEXT NOT NULL,
    black TEXT NOT NULL,
    white_rating INTEGER NOT NULL,
    black_rating INTEGER NOT NULL,
    result TEXT NOT NULL,
    you TEXT,
    time_class TEXT NOT NULL,
    time_control TEXT NOT NULL,
    end_time INTEGER NOT NULL,
    opening TEXT,
    moves INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    accuracy REAL,
    perf INTEGER,
    review TEXT
  );
  CREATE INDEX IF NOT EXISTS game_by_time ON game (end_time DESC);


  CREATE TABLE IF NOT EXISTS card (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    fen TEXT NOT NULL,
    lead TEXT,
    moves TEXT NOT NULL,
    accept TEXT NOT NULL,
    themes TEXT NOT NULL,
    rating INTEGER,
    game TEXT,
    due INTEGER NOT NULL,
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    last INTEGER
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS card_by_due ON card (due);

  CREATE TABLE IF NOT EXISTS repertoire (color TEXT PRIMARY KEY, stamp TEXT NOT NULL, data TEXT NOT NULL) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS opening_card (
    id TEXT PRIMARY KEY,
    color TEXT NOT NULL,
    move TEXT NOT NULL,
    fix INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    due INTEGER NOT NULL,
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    last INTEGER
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS opening_card_by_due ON opening_card (color, active, due);


  CREATE TABLE IF NOT EXISTS attempt (id TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, solved INTEGER NOT NULL, ms INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS attempt_by_id ON attempt (id);
`

const CACHE_SCHEMA = `
  PRAGMA temp_store = MEMORY;
  CREATE TABLE IF NOT EXISTS eval (key TEXT PRIMARY KEY, nodes INTEGER NOT NULL, lines TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS player (name TEXT PRIMARY KEY, url TEXT, fetched INTEGER NOT NULL) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
`

type Row = Record<string, SqlValue>

class Store {
  #db: Database
  #stmts = new Map<string, PreparedStatement>()

  constructor(db: Database, schema: string) {
    this.#db = db
    db.exec(schema)
  }

  exec(text: string) {
    this.#db.exec(text)
  }

  sql(text: string) {
    let stmt = this.#stmts.get(text)
    if (!stmt) this.#stmts.set(text, (stmt = this.#db.prepare(text)))
    const s = stmt
    const use = <T>(args: SqlValue[], read: () => T): T => {
      try {
        if (args.length) s.bind(args)
        return read()
      } finally {
        s.reset(true)
      }
    }
    return {
      all: (...args: SqlValue[]) =>
        use(args, () => {
          const rows: Row[] = []
          while (s.step()) rows.push(s.get({}) as Row)
          return rows
        }),
      get: (...args: SqlValue[]) => use(args, () => (s.step() ? (s.get({}) as Row) : undefined)),
      run: (...args: SqlValue[]) =>
        use(args, () => {
          s.step()
          return { changes: this.#db.changes() }
        }),
    }
  }

  close() {
    for (const stmt of this.#stmts.values()) stmt.finalize()
    this.#stmts.clear()
    this.#db.close()
  }
}

type Open = (file: string) => Database
let opener: Open | null = null
let cache: Store | null = null
let user: Store | null = null

export const openStorage = async () => {
  if (opener) return
  const sqlite3 = await sqlite3InitModule()
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'pip', initialCapacity: 8 }).catch(() => null)
  opener = file => (pool ? new pool.OpfsSAHPoolDb(file) : new sqlite3.oo1.DB(':memory:'))
  cache = new Store(opener('/pip-cache.db'), CACHE_SCHEMA)
}

export const openAccount = (key: string) => {
  user?.close()
  user = new Store(opener!(`/pip-${key}.db`), USER_SCHEMA)
}

export const closeAccount = () => {
  user?.close()
  user = null
}

const sql = (text: string) => user!.sql(text)
const cached = (text: string) => cache!.sql(text)

export const settings = {
  get: <T>(key: string, fallback: T): T => {
    const row = cached('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : fallback
  },
  set: (key: string, value: unknown) => {
    cached('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value))
  },
}

export const tx = <T>(work: () => T): T => {
  user!.exec('BEGIN')
  try {
    const out = work()
    user!.exec('COMMIT')
    return out
  } catch (error) {
    user!.exec('ROLLBACK')
    throw error
  }
}

export const meta = {
  get: <T>(key: string, fallback: T): T => {
    const row = sql('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : fallback
  },
  set: (key: string, value: unknown) => {
    sql('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value))
  },
}

const GAME_COLUMNS = 'id, url, white, black, white_rating, black_rating, result, you, time_class, time_control, end_time, opening, moves, status, accuracy, perf'

const toGame = (r: Row): GameRow => ({
  id: r.id as string,
  url: r.url as string | null,
  white: { name: r.white as string, rating: r.white_rating as number },
  black: { name: r.black as string, rating: r.black_rating as number },
  result: r.result as string,
  you: r.you as Color | null,
  timeClass: r.time_class as string,
  timeControl: r.time_control as string,
  endTime: r.end_time as number,
  opening: r.opening as string | null,
  status: r.status as Status,
  accuracy: r.accuracy as number | null,
  perf: r.perf as number | null,
  moves: r.moves as number,
})

export interface NewGame {
  id: string
  url: string | null
  pgn: string
  white: string
  black: string
  whiteRating: number
  blackRating: number
  result: string
  you: Color | null
  timeClass: string
  timeControl: string
  endTime: number
  opening: string | null
  moves: number
}

export const games = {
  insert: (rows: NewGame[]) =>
    tx(() =>
      rows.reduce((added, g) => {
        const { changes } = sql(
          `INSERT OR IGNORE INTO game (id, url, pgn, white, black, white_rating, black_rating, result, you, time_class, time_control, end_time, opening, moves)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(g.id, g.url, g.pgn, g.white, g.black, g.whiteRating, g.blackRating, g.result, g.you, g.timeClass, g.timeControl, g.endTime, g.opening, g.moves)
        return added + Number(changes)
      }, 0),
    ),
  list: (limit: number, offset: number) =>
    sql(`SELECT ${GAME_COLUMNS} FROM game ORDER BY end_time DESC LIMIT ? OFFSET ?`).all(limit, offset).map(toGame),
  get: (id: string) => {
    const row = sql(`SELECT ${GAME_COLUMNS}, pgn, review FROM game WHERE id = ?`).get(id) as Row | undefined
    if (!row) return null
    return { game: toGame(row), pgn: row.pgn as string, review: row.review ? (JSON.parse(row.review as string) as Review) : null }
  },
  pending: (limit: number) =>
    sql(`SELECT id FROM game WHERE status IN ('new', 'error') AND you IS NOT NULL ORDER BY end_time DESC LIMIT ?`).all(limit).map(r => r.id as string),
  outdated: (version: number) =>
    sql(`SELECT id FROM game WHERE status = 'done' AND coalesce(json_extract(review, '$.version'), 0) < ? ORDER BY end_time DESC`).all(version).map(r => r.id as string),
  status: (id: string, status: Status) => sql('UPDATE game SET status = ? WHERE id = ?').run(status, id),
  resetStuck: () => sql(`UPDATE game SET status = 'new' WHERE status IN ('queued', 'analyzing')`).run(),
  review: (id: string, review: Review, accuracy: number | null, perf: number | null) =>
    sql(`UPDATE game SET review = ?, accuracy = ?, perf = ?, status = 'done' WHERE id = ?`).run(JSON.stringify(review), accuracy, perf, id),
  draft: (id: string, review: Review) => sql('UPDATE game SET review = ? WHERE id = ?').run(JSON.stringify(review), id),
  reviewed: () =>
    sql(`SELECT ${GAME_COLUMNS}, review FROM game WHERE status = 'done' AND you IS NOT NULL ORDER BY end_time ASC`).all().map(r => ({
      game: toGame(r),
      review: JSON.parse(r.review as string) as Review,
    })),
  claim: (username: string) =>
    sql(`UPDATE game SET you = CASE WHEN lower(white) = lower(?1) THEN 'white' WHEN lower(black) = lower(?1) THEN 'black' ELSE you END`).run(username),
  counts: () => sql(`SELECT count(*) AS games, sum(status = 'done') AS analyzed FROM game`).get() as { games: number; analyzed: number | null },
  byColor: (color: Color, limit: number) =>
    sql('SELECT pgn, result FROM game WHERE you = ? ORDER BY end_time DESC LIMIT ?').all(color, limit) as unknown as { pgn: string; result: string }[],
  stampFor: (color: Color) => {
    const row = sql('SELECT count(*) AS n, max(end_time) AS t FROM game WHERE you = ?').get(color) as { n: number; t: number | null }
    return `${row.n}:${row.t ?? 0}`
  },
  latestRating: (timeClass?: string) =>
    sql(
      `SELECT CASE you WHEN 'white' THEN white_rating ELSE black_rating END AS rating FROM game
       WHERE you IS NOT NULL AND (?1 IS NULL OR time_class = ?1) ORDER BY end_time DESC LIMIT 1`,
    ).get(timeClass ?? null) as { rating: number } | undefined,
}

export const evals = {
  get: (key: string, nodes: number) => {
    const row = cached('SELECT nodes, lines FROM eval WHERE key = ?').get(key) as { nodes: number; lines: string } | undefined
    return row && row.nodes >= nodes ? (JSON.parse(row.lines) as Line[]) : null
  },
  put: (key: string, nodes: number, lines: Line[]) =>
    cached('INSERT INTO eval (key, nodes, lines) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET nodes = excluded.nodes, lines = excluded.lines WHERE excluded.nodes >= eval.nodes').run(
      key,
      nodes,
      JSON.stringify(lines),
    ),
}

const toCard = (r: Row): Card => ({
  id: r.id as string,
  kind: r.kind as Card['kind'],
  fen: r.fen as string,
  lead: r.lead as string | null,
  moves: JSON.parse(r.moves as string),
  accept: JSON.parse(r.accept as string),
  themes: JSON.parse(r.themes as string),
  rating: r.rating as number | null,
  game: r.game ? JSON.parse(r.game as string) : null,
  due: r.due as number,
  reps: r.reps as number,
})

export interface CardMemory {
  stability: number
  difficulty: number
  reps: number
  lapses: number
  last: number | null
  due: number
}

export const cards = {
  add: (card: Omit<Card, 'reps'>) =>
    sql(`INSERT OR IGNORE INTO card (id, kind, fen, lead, moves, accept, themes, rating, game, due) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      card.id,
      card.kind,
      card.fen,
      card.lead,
      JSON.stringify(card.moves),
      JSON.stringify(card.accept),
      JSON.stringify(card.themes),
      card.rating,
      card.game ? JSON.stringify(card.game) : null,
      card.due,
    ),
  due: (now: number, limit: number) => sql('SELECT * FROM card WHERE due <= ? ORDER BY due LIMIT ?').all(now, limit).map(toCard),
  memory: (id: string) => sql('SELECT stability, difficulty, reps, lapses, last FROM card WHERE id = ?').get(id) as Omit<CardMemory, 'due'> | undefined,
  update: (id: string, m: CardMemory) =>
    sql('UPDATE card SET stability = ?, difficulty = ?, reps = ?, lapses = ?, last = ?, due = ? WHERE id = ?').run(m.stability, m.difficulty, m.reps, m.lapses, m.last, m.due, id),
  stats: (now: number) =>
    sql(`SELECT count(*) AS cards, sum(due <= ?) AS due, sum(reps > 0 AND stability >= 21) AS learned FROM card`).get(now) as {
      cards: number
      due: number | null
      learned: number | null
    },
}

export const attempts = {
  add: (id: string, kind: string, solved: boolean, ms: number) =>
    sql('INSERT INTO attempt (id, kind, at, solved, ms) VALUES (?, ?, ?, ?, ?)').run(id, kind, Date.now(), solved ? 1 : 0, Math.round(ms)),
  seen: (id: string) => !!sql('SELECT 1 FROM attempt WHERE id = ? LIMIT 1').get(id),
}

export const repertoires = {
  get: (color: Color) => sql('SELECT stamp, data FROM repertoire WHERE color = ?').get(color) as { stamp: string; data: string } | undefined,
  put: (color: Color, stamp: string, data: unknown) =>
    sql('INSERT INTO repertoire (color, stamp, data) VALUES (?, ?, ?) ON CONFLICT (color) DO UPDATE SET stamp = excluded.stamp, data = excluded.data').run(color, stamp, JSON.stringify(data)),
}

export interface OpeningCardRow {
  id: string
  fix: number
  games: number
  due: number
  reps: number
}

export const openingCards = {
  sync: (color: Color, rows: { id: string; move: string; fix: boolean; games: number }[]) =>
    tx(() => {
      const now = Date.now()
      sql('UPDATE opening_card SET active = 0 WHERE color = ?').run(color)
      for (const r of rows) {
        sql(
          `INSERT INTO opening_card (id, color, move, fix, games, due) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT (id) DO UPDATE SET
             active = 1, fix = excluded.fix, games = excluded.games,
             due = CASE WHEN opening_card.move = excluded.move THEN opening_card.due ELSE excluded.due END,
             reps = CASE WHEN opening_card.move = excluded.move THEN opening_card.reps ELSE 0 END,
             stability = CASE WHEN opening_card.move = excluded.move THEN opening_card.stability ELSE 0 END,
             difficulty = CASE WHEN opening_card.move = excluded.move THEN opening_card.difficulty ELSE 0 END,
             last = CASE WHEN opening_card.move = excluded.move THEN opening_card.last ELSE NULL END,
             move = excluded.move`,
        ).run(r.id, color, r.move, r.fix ? 1 : 0, r.games, now)
      }
    }),
  list: (color: Color, now: number, dueOnly: boolean, limit: number) =>
    sql(
      `SELECT id, fix, games, due, reps FROM opening_card WHERE color = ?1 AND active = 1 AND (?2 = 0 OR due <= ?3)
       ORDER BY fix DESC, due ASC, games DESC LIMIT ?4`,
    ).all(color, dueOnly ? 1 : 0, now, limit) as unknown as OpeningCardRow[],
  dueSet: (color: Color, now: number) =>
    new Set(sql('SELECT id FROM opening_card WHERE color = ? AND active = 1 AND due <= ?').all(color, now).map(r => r.id as string)),
  counts: (color: Color, now: number) =>
    sql('SELECT count(*) AS positions, coalesce(sum(due <= ?), 0) AS due, coalesce(sum(fix), 0) AS fixes FROM opening_card WHERE color = ? AND active = 1').get(now, color) as {
      positions: number
      due: number
      fixes: number
    },
  memory: (id: string) => sql('SELECT stability, difficulty, reps, lapses, last FROM opening_card WHERE id = ?').get(id) as Omit<CardMemory, 'due'> | undefined,
  update: (id: string, m: CardMemory) =>
    sql('UPDATE opening_card SET stability = ?, difficulty = ?, reps = ?, lapses = ?, last = ?, due = ? WHERE id = ?').run(m.stability, m.difficulty, m.reps, m.lapses, m.last, m.due, id),
}

export const players = {
  get: (name: string) => cached('SELECT url, fetched FROM player WHERE name = ?').get(name) as { url: string | null; fetched: number } | undefined,
  put: (name: string, url: string | null) =>
    cached('INSERT INTO player (name, url, fetched) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET url = excluded.url, fetched = excluded.fetched').run(name, url, Date.now()),
}

export const wipeAccount = () =>
  tx(() => {
    for (const table of ['game', 'card', 'attempt', 'repertoire', 'opening_card', 'meta']) sql(`DELETE FROM ${table}`).run()
  })
