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
  if (!kidCols.includes("ababank_ref")) {
    // Maps this kid to an AbaBank user (that user's exact name, or a numeric id).
    db.exec("ALTER TABLE kid ADD COLUMN ababank_ref TEXT");
  }

  const taskCols = db.prepare("PRAGMA table_info(task)").all().map((c) => c.name);
  if (!taskCols.includes("alt_id")) {
    db.exec("ALTER TABLE task ADD COLUMN alt_id INTEGER");
  }

  const tplCols = db.prepare("PRAGMA table_info(chore_template)").all().map((c) => c.name);
  if (!tplCols.includes("streak_award")) {
    // Base bonus points for keeping the streak; 0 = off.
    db.exec("ALTER TABLE chore_template ADD COLUMN streak_award INTEGER NOT NULL DEFAULT 0");
  }
  if (!tplCols.includes("streak_interval")) {
    // Every N streak days, the award grows by streak_step. Formula:
    // award = streak_award + floor(streak / streak_interval) * streak_step
    db.exec("ALTER TABLE chore_template ADD COLUMN streak_interval INTEGER NOT NULL DEFAULT 10");
  }
  if (!tplCols.includes("streak_step")) {
    db.exec("ALTER TABLE chore_template ADD COLUMN streak_step INTEGER NOT NULL DEFAULT 1");
  }

  // Alternating (rotating) shared chores. Turn passes between kids per `cadence`.
  db.exec(`
    CREATE TABLE IF NOT EXISTS alt_chore (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🔁',
      points INTEGER NOT NULL DEFAULT 5,
      kid_ids TEXT NOT NULL,                    -- CSV of kid ids, in rotation order
      cadence TEXT NOT NULL DEFAULT 'daily',    -- daily | on_completion | weekly
      turn_index INTEGER NOT NULL DEFAULT 0,    -- used by on_completion
      anchor_date TEXT NOT NULL,                -- start date for calendar cadences
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Cash-out ledger: each row is a points→money conversion pushed to AbaBank.
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversion (
      id INTEGER PRIMARY KEY,
      kid_id INTEGER NOT NULL REFERENCES kid(id),
      points INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      external_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed
      ababank_tx_id INTEGER,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

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
