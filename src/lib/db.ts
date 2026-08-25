import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { __recoverflow_db?: Database.Database };

export const db =
  globalForDb.__recoverflow_db ??
  (() => {
    const d = new Database(path.join(DATA_DIR, "recoverflow.db"));
    d.pragma("journal_mode = WAL");
    d.pragma("synchronous = NORMAL");
    d.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone_mask TEXT NOT NULL,
  email_mask TEXT NOT NULL,
  dnc INTEGER DEFAULT 0,
  segment TEXT NOT NULL,
  payday INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_sim_ms INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  size INTEGER NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS leaks (
  id TEXT PRIMARY KEY,
  batch_id INTEGER NOT NULL,
  customer_id TEXT NOT NULL,
  vector TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  cause_code TEXT NOT NULL,
  cause_class TEXT NOT NULL,
  planted_truth TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  is_control INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  stage TEXT NOT NULL DEFAULT '',
  next_action_sim_ms INTEGER,
  recovered_paise INTEGER NOT NULL DEFAULT 0,
  spent_paise INTEGER NOT NULL DEFAULT 0,
  opened_sim_ms INTEGER NOT NULL,
  closed_sim_ms INTEGER,
  last_diagnosis TEXT,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_leaks_next ON leaks(next_action_sim_ms);
CREATE INDEX IF NOT EXISTS idx_leaks_cust ON leaks(customer_id);
CREATE TABLE IF NOT EXISTS touches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leak_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  channel TEXT NOT NULL,
  kind TEXT NOT NULL,
  scheduled_sim_ms INTEGER NOT NULL,
  sent_sim_ms INTEGER,
  status TEXT NOT NULL,
  outcome TEXT,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  cost_paise INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_touches_leak ON touches(leak_id);
CREATE INDEX IF NOT EXISTS idx_touches_sched ON touches(scheduled_sim_ms);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sim_ms INTEGER NOT NULL,
  leak_id TEXT,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_leak ON audit(leak_id);
`);
    return d;
  })();

globalForDb.__recoverflow_db = db;

export function getMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string) {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
