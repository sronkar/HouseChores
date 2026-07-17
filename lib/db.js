import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Singleton across dev hot-reloads.
const g = globalThis;

function open() {
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "housechores.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kid (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🙂',
      color TEXT NOT NULL DEFAULT '#4f83cc',
      display_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS chore_template (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '✅',
      points INTEGER NOT NULL DEFAULT 5,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chore_template_kid (
      template_id INTEGER NOT NULL REFERENCES chore_template(id) ON DELETE CASCADE,
      kid_id INTEGER NOT NULL REFERENCES kid(id) ON DELETE CASCADE,
      PRIMARY KEY (template_id, kid_id)
    );

    CREATE TABLE IF NOT EXISTS task (
      id INTEGER PRIMARY KEY,
      source TEXT NOT NULL,                      -- 'recurring' | 'board'
      template_id INTEGER REFERENCES chore_template(id),
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '✅',
      points_snapshot INTEGER NOT NULL,
      date TEXT NOT NULL,                        -- YYYY-MM-DD (local)
      assigned_kid_id INTEGER REFERENCES kid(id),-- null for board
      done_by_kid_id INTEGER REFERENCES kid(id),
      done_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',       -- open|pending|approved|rejected|missed
      approved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_task_date ON task(date);
    CREATE INDEX IF NOT EXISTS idx_task_status ON task(status);
    CREATE INDEX IF NOT EXISTS idx_task_tpl_kid ON task(template_id, assigned_kid_id, date);

    -- Immutable ledger. SOURCE OF TRUTH for points; AbaBank consumes this later.
    CREATE TABLE IF NOT EXISTS earn_event (
      id INTEGER PRIMARY KEY,
      kid_id INTEGER NOT NULL REFERENCES kid(id),
      task_id INTEGER NOT NULL REFERENCES task(id),
      points INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      consumed_by_bank INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS excused_day (
      id INTEGER PRIMARY KEY,
      kid_id INTEGER REFERENCES kid(id),         -- null = whole family
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS setting (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Additive migrations (safe on an existing db).
  const kidCols = db.prepare("PRAGMA table_info(kid)").all().map((c) => c.name);
  if (!kidCols.includes("toddler")) {
    db.exec("ALTER TABLE kid ADD COLUMN toddler INTEGER NOT NULL DEFAULT 0");
  }

  // Defaults
  const hasPin = db.prepare("SELECT value FROM setting WHERE key='parent_pin'").get();
  if (!hasPin) {
    db.prepare("INSERT INTO setting(key,value) VALUES('parent_pin','1234')").run();
  }
}

/** @returns {import('node:sqlite').DatabaseSync} */
export function db() {
  if (!g.__hc_db) g.__hc_db = open();
  return g.__hc_db;
}
