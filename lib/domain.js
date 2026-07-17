import { db } from "./db.js";

// ---------- date helpers (local day) ----------
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return todayStr(dt);
}

// ---------- settings ----------
export function getSetting(key) {
  return db().prepare("SELECT value FROM setting WHERE key=?").get(key)?.value ?? null;
}
export function setSetting(key, value) {
  db().prepare(
    "INSERT INTO setting(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, String(value));
}
export function checkPin(pin) {
  return getSetting("parent_pin") === String(pin);
}

// ---------- kids ----------
export function getKids() {
  return db()
    .prepare("SELECT * FROM kid WHERE active=1 ORDER BY display_order, id")
    .all();
}
export function getKid(id) {
  return db().prepare("SELECT * FROM kid WHERE id=?").get(id);
}
export function addKid({ name, emoji = "🙂", color = "#4f83cc" }) {
  const ord = db().prepare("SELECT COALESCE(MAX(display_order),0)+1 AS n FROM kid").get().n;
  return db()
    .prepare("INSERT INTO kid(name,emoji,color,display_order) VALUES(?,?,?,?)")
    .run(name, emoji, color, ord).lastInsertRowid;
}
export function updateKid(id, { name, emoji, color }) {
  db().prepare("UPDATE kid SET name=?, emoji=?, color=? WHERE id=?").run(name, emoji, color, id);
}
export function deactivateKid(id) {
  db().prepare("UPDATE kid SET active=0 WHERE id=?").run(id);
}

// ---------- excused days ----------
export function isExcused(kidId, dateStr) {
  const row = db()
    .prepare(
      `SELECT 1 FROM excused_day
       WHERE (kid_id IS NULL OR kid_id=?)
         AND start_date<=? AND end_date>=? LIMIT 1`
    )
    .get(kidId, dateStr, dateStr);
  return !!row;
}
export function listExcused() {
  return db()
    .prepare(
      `SELECT e.*, k.name AS kid_name FROM excused_day e
       LEFT JOIN kid k ON k.id=e.kid_id ORDER BY start_date DESC`
    )
    .all();
}
export function addExcused({ kidId = null, start, end, reason = "" }) {
  db()
    .prepare("INSERT INTO excused_day(kid_id,start_date,end_date,reason) VALUES(?,?,?,?)")
    .run(kidId, start, end, reason);
}
export function deleteExcused(id) {
  db().prepare("DELETE FROM excused_day WHERE id=?").run(id);
}

// ---------- templates (recurring chores) ----------
export function listTemplates() {
  const tpls = db()
    .prepare("SELECT * FROM chore_template WHERE active=1 ORDER BY id")
    .all();
  const kidsStmt = db().prepare(
    "SELECT kid_id FROM chore_template_kid WHERE template_id=?"
  );
  for (const t of tpls) t.kidIds = kidsStmt.all(t.id).map((r) => r.kid_id);
  return tpls;
}
export function addTemplate({ name, emoji = "✅", points = 5, kidIds = [] }) {
  const d = db();
  const id = d
    .prepare("INSERT INTO chore_template(name,emoji,points) VALUES(?,?,?)")
    .run(name, emoji, points).lastInsertRowid;
  const ins = d.prepare("INSERT INTO chore_template_kid(template_id,kid_id) VALUES(?,?)");
  for (const kid of kidIds) ins.run(id, kid);
  return id;
}
export function updateTemplate(id, { name, emoji, points, kidIds }) {
  const d = db();
  d.prepare("UPDATE chore_template SET name=?, emoji=?, points=? WHERE id=?").run(
    name, emoji, points, id
  );
  d.prepare("DELETE FROM chore_template_kid WHERE template_id=?").run(id);
  const ins = d.prepare("INSERT INTO chore_template_kid(template_id,kid_id) VALUES(?,?)");
  for (const kid of kidIds) ins.run(id, kid);
}
export function deactivateTemplate(id) {
  db().prepare("UPDATE chore_template SET active=0 WHERE id=?").run(id);
}

// ---------- daily task generation + missed sweep ----------
// Idempotent: call before reading any day's tasks.
export function ensureDay(date = todayStr()) {
  const d = db();
  // Sweep: past-day recurring 'open' tasks become 'missed'.
  d.prepare("UPDATE task SET status='missed' WHERE source='recurring' AND status='open' AND date<?").run(date);

  // Generate today's recurring tasks for each (template, kid) not excused and not yet present.
  const links = d
    .prepare(
      `SELECT ct.template_id, ct.kid_id, t.name, t.emoji, t.points
       FROM chore_template_kid ct
       JOIN chore_template t ON t.id=ct.template_id
       JOIN kid k ON k.id=ct.kid_id
       WHERE t.active=1 AND k.active=1`
    )
    .all();
  const exists = d.prepare(
    "SELECT 1 FROM task WHERE source='recurring' AND template_id=? AND assigned_kid_id=? AND date=?"
  );
  const ins = d.prepare(
    `INSERT INTO task(source,template_id,name,emoji,points_snapshot,date,assigned_kid_id,status)
     VALUES('recurring',?,?,?,?,?,?,'open')`
  );
  for (const l of links) {
    if (isExcused(l.kid_id, date)) continue;
    if (exists.get(l.template_id, l.kid_id, date)) continue;
    ins.run(l.template_id, l.name, l.emoji, l.points, date, l.kid_id);
  }
}

// ---------- streaks (derived) ----------
// Consecutive completed days for a template+kid, ending at the most recent day.
// pending & approved count; missed/rejected break; excused days are skipped;
// an as-yet-undone 'today' neither counts nor breaks.
export function choreStreak(templateId, kidId, today = todayStr()) {
  const d = db();
  const stmt = d.prepare(
    "SELECT status FROM task WHERE source='recurring' AND template_id=? AND assigned_kid_id=? AND date=?"
  );
  let streak = 0;
  let cur = today;
  // Safety bound: never look back more than ~2 years.
  for (let i = 0; i < 800; i++) {
    if (isExcused(kidId, cur)) { cur = addDays(cur, -1); continue; }
    const row = stmt.get(templateId, kidId, cur);
    const status = row?.status;
    if (status === "approved" || status === "pending") {
      streak++;
      cur = addDays(cur, -1);
      continue;
    }
    if (cur === today) {
      // today not done yet — don't count, don't break; look at yesterday
      cur = addDays(cur, -1);
      continue;
    }
    break; // missed / rejected / no-task on a past day → streak ends
  }
  return streak;
}

// ---------- balances ----------
export function kidBalance(kidId) {
  return (
    db()
      .prepare(
        "SELECT COALESCE(SUM(points),0) AS pts FROM earn_event WHERE kid_id=? AND consumed_by_bank=0"
      )
      .get(kidId).pts ?? 0
  );
}
export function kidEarnedInRange(kidId, start, end) {
  return (
    db()
      .prepare(
        `SELECT COALESCE(SUM(points),0) AS pts FROM earn_event
         WHERE kid_id=? AND date(created_at) BETWEEN ? AND ?`
      )
      .get(kidId, start, end).pts ?? 0
  );
}

// ---------- kid day view ----------
export function getKidDay(kidId, date = todayStr()) {
  ensureDay(date);
  const d = db();
  const assigned = d
    .prepare(
      `SELECT * FROM task
       WHERE source='recurring' AND assigned_kid_id=? AND date=?
       ORDER BY id`
    )
    .all(kidId, date);
  for (const t of assigned) t.streak = choreStreak(t.template_id, kidId, date);
  const board = getBoard();
  return {
    kid: getKid(kidId),
    date,
    assigned,
    board,
    balance: kidBalance(kidId),
  };
}

// ---------- board (unassigned claimable one-offs) ----------
export function getBoard() {
  // Board items persist (open or pending) until approved/removed; not date-scoped.
  return db()
    .prepare(
      `SELECT t.*, k.name AS done_by_name, k.emoji AS done_by_emoji
       FROM task t LEFT JOIN kid k ON k.id=t.done_by_kid_id
       WHERE t.source='board' AND t.status IN ('open','pending')
       ORDER BY t.id`
    )
    .all();
}
export function addBoardChore({ name, emoji = "📌", points = 5 }) {
  return db()
    .prepare(
      `INSERT INTO task(source,name,emoji,points_snapshot,date,status)
       VALUES('board',?,?,?,?, 'open')`
    )
    .run(name, emoji, points, todayStr()).lastInsertRowid;
}
export function deleteTask(id) {
  db().prepare("DELETE FROM task WHERE id=? AND status IN ('open','pending')").run(id);
}

// ---------- the daily loop: done / approve / reject ----------
export function markDone(taskId, kidId) {
  // open -> pending. For board, record who did it.
  const d = db();
  const t = d.prepare("SELECT * FROM task WHERE id=?").get(taskId);
  if (!t || t.status !== "open") return false;
  d.prepare(
    "UPDATE task SET status='pending', done_by_kid_id=?, done_at=datetime('now') WHERE id=?"
  ).run(kidId, taskId);
  return true;
}

export function pendingQueue() {
  return db()
    .prepare(
      `SELECT t.*, k.name AS kid_name, k.emoji AS kid_emoji, k.color AS kid_color
       FROM task t
       JOIN kid k ON k.id = COALESCE(t.done_by_kid_id, t.assigned_kid_id)
       WHERE t.status='pending'
       ORDER BY t.done_at`
    )
    .all();
}

export function approveTask(taskId) {
  const d = db();
  const t = d.prepare("SELECT * FROM task WHERE id=?").get(taskId);
  if (!t || t.status !== "pending") return false;
  const kidId = t.done_by_kid_id ?? t.assigned_kid_id;
  d.prepare("UPDATE task SET status='approved', approved_at=datetime('now') WHERE id=?").run(taskId);
  // immutable earn (points snapshot)
  d.prepare("INSERT INTO earn_event(kid_id,task_id,points) VALUES(?,?,?)").run(
    kidId, taskId, t.points_snapshot
  );
  return true;
}

export function rejectTask(taskId) {
  // Back to not-done so the kid can redo. Streak un-ticks (pending no longer counts).
  const d = db();
  const t = d.prepare("SELECT * FROM task WHERE id=?").get(taskId);
  if (!t || t.status !== "pending") return false;
  d.prepare(
    "UPDATE task SET status='open', done_by_kid_id=NULL, done_at=NULL WHERE id=?"
  ).run(taskId);
  return true;
}

export function approveAll() {
  const rows = db().prepare("SELECT id FROM task WHERE status='pending'").all();
  let n = 0;
  for (const r of rows) if (approveTask(r.id)) n++;
  return n;
}

// ---------- parent family overview ----------
export function familyOverview(date = todayStr()) {
  ensureDay(date);
  const kids = getKids();
  const weekStart = addDays(date, -6);
  return kids.map((k) => ({
    ...k,
    balance: kidBalance(k.id),
    weekPoints: kidEarnedInRange(k.id, weekStart, date),
    streaks: listTemplates()
      .filter((t) => t.kidIds.includes(k.id))
      .map((t) => ({ name: t.name, emoji: t.emoji, streak: choreStreak(t.id, k.id, date) })),
  }));
}
