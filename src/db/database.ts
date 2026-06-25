/**
 * database.ts
 * SQLite layer using sql.js (pure JS, no native bindings required).
 * The database is persisted to disk via fs read/write on every mutation.
 */

import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import fs from "fs";
import path from "path";
import { config } from "../lib/config.js";

let SQL: SqlJsStatic;
let db: Database;

const DB_PATH = path.resolve(config.dbPath);

export async function initDatabase(): Promise<void> {
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  runMigrations();
  persist();
}

/** Persist in-memory DB to disk */
function persist(): void {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function runMigrations(): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS handymen (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL,
      whatsapp      TEXT,
      service_types TEXT NOT NULL,   -- JSON array
      location      TEXT NOT NULL,
      rating        REAL DEFAULT 0,
      bookings      INTEGER DEFAULT 0,
      trust_score   REAL DEFAULT 0,
      price_min     REAL DEFAULT 0,
      price_max     REAL DEFAULT 0,
      acra_reg      TEXT,
      acra_status   TEXT DEFAULT 'unverified',
      bio           TEXT,
      available     INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id           TEXT PRIMARY KEY,
      handyman_id  TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      rating       REAL NOT NULL,
      comment      TEXT,
      service_type TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (handyman_id) REFERENCES handymen(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      handyman_id     TEXT NOT NULL,
      service_type    TEXT NOT NULL,
      address         TEXT NOT NULL,
      datetime        TEXT NOT NULL,
      price           REAL,
      status          TEXT DEFAULT 'pending',   -- pending|confirmed|completed|cancelled
      stripe_session  TEXT,
      payment_status  TEXT DEFAULT 'unpaid',    -- unpaid|paid
      user_phone      TEXT,                     -- customer WhatsApp, shared w/ contractor once paid
      notes           TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );
  `);

  // Backfill column for databases created before user_phone existed (no-op if present).
  try {
    db.run("ALTER TABLE bookings ADD COLUMN user_phone TEXT");
  } catch {
    /* column already exists */
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS call_results (
      id               TEXT PRIMARY KEY,
      booking_id       TEXT,
      handyman_id      TEXT NOT NULL,
      call_status      TEXT NOT NULL,  -- success|no_answer|busy|failed
      transcription    TEXT,
      availability     INTEGER,
      price_quoted     REAL,
      datetime_offered TEXT,
      call_duration    INTEGER,
      vapi_call_id     TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id           TEXT PRIMARY KEY,
      booking_id   TEXT,
      handyman_id  TEXT,
      direction    TEXT NOT NULL,  -- outbound|inbound
      message      TEXT NOT NULL,
      wa_msg_id    TEXT,
      status       TEXT DEFAULT 'sent',
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `);

  // NEW: stores inbound WhatsApp replies from handymen with parsed quote data
  db.run(`
    CREATE TABLE IF NOT EXISTS handyman_quotes (
      id               TEXT PRIMARY KEY,
      session_id       TEXT NOT NULL,   -- links to the outreach batch
      handyman_id      TEXT NOT NULL,
      handyman_phone   TEXT NOT NULL,
      raw_message      TEXT NOT NULL,   -- original WhatsApp text
      price_quoted     REAL,            -- parsed price in SGD
      available        INTEGER DEFAULT 1,
      datetime_offered TEXT,            -- parsed available datetime
      wa_msg_id        TEXT,
      received_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (handyman_id) REFERENCES handymen(id)
    );
  `);

  // NEW: live web-discovered leads (via Exa). Stored server-side so their phone
  // number never has to live on the client — discover_services_web returns a
  // masked contact + an id; outreach/booking resolve the real number by id.
  db.run(`
    CREATE TABLE IF NOT EXISTS web_leads (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      phone        TEXT,
      website      TEXT,
      area         TEXT,
      service_type TEXT,
      price_hint   TEXT,
      source_url   TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `);

  // NEW: self-registration applications from handymen, beauticians, facialists
  db.run(`
    CREATE TABLE IF NOT EXISTS provider_applications (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      phone            TEXT NOT NULL,
      whatsapp         TEXT,
      email            TEXT,
      provider_type    TEXT NOT NULL,   -- handyman|beautician|facialist|other
      service_types    TEXT NOT NULL,   -- JSON array of services offered
      location         TEXT NOT NULL,
      price_min        REAL DEFAULT 0,
      price_max        REAL DEFAULT 0,
      acra_reg         TEXT,
      bio              TEXT,
      years_experience INTEGER DEFAULT 0,
      portfolio_url    TEXT,
      status           TEXT DEFAULT 'pending',  -- pending|approved|rejected
      rejection_reason TEXT,
      submitted_at     TEXT DEFAULT (datetime('now')),
      reviewed_at      TEXT
    );
  `);

  persist();
}

/** Run a SELECT and return all rows as plain objects */
export function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

/** Run a SELECT and return the first row or null */
export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Run an INSERT/UPDATE/DELETE and persist to disk */
export function execute(
  sql: string,
  params: (string | number | null)[] = []
): void {
  db.run(sql, params);
  persist();
}

export function getDb(): Database {
  return db;
}
