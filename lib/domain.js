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
export function addKid({ name, emoji = "🙂", color = "#4f83cc", toddler = 0 }) {
  const ord = db().prepare("SELECT COALESCE(MAX(display_order),0)+1 AS n FROM kid").get().n;
  return db()
    .prepare("INSERT INTO kid(name,emoji,color,display_order,toddler) VALUES(?,?,?,?,?)")
    .run(name, emoji, color, ord, toddler ? 1 : 0).lastInsertRowid;
}
export function updateKid(id, { name, emoji, color, toddler = 0 }) {
  db().prepare("UPDATE kid SET name=?, emoji=?, color=?, toddler=? WHERE id=?")
    .run(name, emoji, color, toddler ? 1 : 0, id);
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
// Points earned in a date range, grouped by the chore's LOCAL day (task.date),
// not the UTC approval timestamp — so a late-night approval counts on the right day.
export function kidEarnedInRange(kidId, start, end) {
  return (
    db()
      .prepare(
        `SELECT COALESCE(SUM(e.points),0) AS pts
         FROM earn_event e JOIN task t ON t.id=e.task_id
         WHERE e.kid_id=? AND t.date BETWEEN ? AND ?`
      )
      .get(kidId, start, end).pts ?? 0
  );
}

// Lifetime points ever earned (ignores bank consumption) — for "all-time" stats.
export function kidLifetimePoints(kidId) {
  return db()
    .prepare("SELECT COALESCE(SUM(points),0) AS pts FROM earn_event WHERE kid_id=?")
    .get(kidId).pts ?? 0;
}

// Count of approved chores (lifetime).
export function kidTotalDone(kidId) {
  return db()
    .prepare(
      "SELECT COUNT(*) AS n FROM task WHERE status='approved' AND COALESCE(done_by_kid_id,assigned_kid_id)=?"
    )
    .get(kidId).n ?? 0;
}

// Points per local day for the last `days` days (oldest→newest), zero-filled.
export function kidPointsByDay(kidId, days = 7, today = todayStr()) {
  const start = addDays(today, -(days - 1));
  const rows = db()
    .prepare(
      `SELECT t.date AS d, COALESCE(SUM(e.points),0) AS pts
       FROM earn_event e JOIN task t ON t.id=e.task_id
       WHERE e.kid_id=? AND t.date>=? GROUP BY t.date`
    )
    .all(kidId, start);
  const map = new Map(rows.map((r) => [r.d, r.pts]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    out.push({ date: d, pts: map.get(d) ?? 0 });
  }
  return out;
}

// Longest ever streak for a template+kid (excused days bridge, don't reset).
export function choreBestStreak(templateId, kidId, today = todayStr()) {
  const d = db();
  const earliest = d
    .prepare(
      "SELECT MIN(date) AS m FROM task WHERE source='recurring' AND template_id=? AND assigned_kid_id=?"
    )
    .get(templateId, kidId).m;
  if (!earliest) return 0;
  const stmt = d.prepare(
    "SELECT status FROM task WHERE source='recurring' AND template_id=? AND assigned_kid_id=? AND date=?"
  );
  let best = 0, run = 0, cur = earliest;
  for (let i = 0; i < 4000 && cur <= today; i++) {
    if (isExcused(kidId, cur)) { cur = addDays(cur, 1); continue; }
    const status = stmt.get(templateId, kidId, cur)?.status;
    if (status === "approved" || status === "pending") {
      run++; if (run > best) best = run;
    } else if (cur === today && (!status || status === "open")) {
      // today not finished yet — don't reset
    } else {
      run = 0;
    }
    cur = addDays(cur, 1);
  }
  return best;
}

// Recent approved chores for a kid (newest first).
export function kidRecentActivity(kidId, limit = 15) {
  return db()
    .prepare(
      `SELECT t.name, t.emoji, t.points_snapshot, t.approved_at, t.date, t.source
       FROM task t
       WHERE t.status='approved' AND COALESCE(t.done_by_kid_id,t.assigned_kid_id)=?
       ORDER BY t.approved_at DESC LIMIT ?`
    )
    .all(kidId, limit);
}

// Full stats bundle for a kid's "My progress" page.
export function kidStats(kidId, today = todayStr()) {
  ensureDay(today);
  const kid = getKid(kidId);
  const weekStart = addDays(today, -6);
  const prevStart = addDays(today, -13);
  const prevEnd = addDays(today, -7);
  const streaks = listTemplates()
    .filter((t) => t.kidIds.includes(kidId))
    .map((t) => ({
      name: t.name,
      emoji: t.emoji,
      current: choreStreak(t.id, kidId, today),
      best: choreBestStreak(t.id, kidId, today),
    }));
  return {
    kid,
    balance: kidBalance(kidId),
    lifetime: kidLifetimePoints(kidId),
    totalDone: kidTotalDone(kidId),
    weekPoints: kidEarnedInRange(kidId, weekStart, today),
    lastWeekPoints: kidEarnedInRange(kidId, prevStart, prevEnd),
    byDay: kidPointsByDay(kidId, 7, today),
    streaks,
    recent: kidRecentActivity(kidId, 15),
  };
}

// Parent audit feed: recent approvals across all kids (newest first).
export function familyHistory(limit = 40) {
  return db()
    .prepare(
      `SELECT t.name, t.emoji, t.points_snapshot, t.approved_at, t.source,
              k.name AS kid_name, k.emoji AS kid_emoji, k.color AS kid_color
       FROM task t
       JOIN kid k ON k.id = COALESCE(t.done_by_kid_id, t.assigned_kid_id)
       WHERE t.status='approved'
       ORDER BY t.approved_at DESC LIMIT ?`
    )
    .all(limit);
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

// ---------- AbaBank seam: config, money, cash-out ----------
export function getBankConfig() {
  return {
    url: getSetting("ababank_url") || "",
    token: getSetting("ababank_token") || "",
    pointsPerDollar: Number(getSetting("points_per_dollar") || 100),
    currency: getSetting("ababank_currency") || "USD",
  };
}
export function setBankConfig({ url, token, pointsPerDollar, currency }) {
  if (url !== undefined) setSetting("ababank_url", url.trim());
  if (token !== undefined) setSetting("ababank_token", token.trim());
  if (pointsPerDollar !== undefined) {
    const n = Math.max(1, Math.round(Number(pointsPerDollar) || 100));
    setSetting("points_per_dollar", n);
  }
  if (currency !== undefined) setSetting("ababank_currency", currency.trim().toUpperCase());
}
export function setKidAbabankRef(kidId, ref) {
  db().prepare("UPDATE kid SET ababank_ref=? WHERE id=?").run((ref || "").trim() || null, kidId);
}

// points -> integer cents, using points_per_dollar (e.g. 100 pts = $1 -> 1pt = 1¢).
export function centsForPoints(points, pointsPerDollar) {
  return Math.round((points * 100) / pointsPerDollar);
}
export function formatMoney(cents, currency = "USD") {
  const sym = { USD: "$", ILS: "₪", EUR: "€", GBP: "£", CAD: "C$", AUD: "A$" }[currency] || currency + " ";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${sym}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
export function kidMoneyValue(kidId) {
  const { pointsPerDollar, currency } = getBankConfig();
  return { cents: centsForPoints(kidBalance(kidId), pointsPerDollar), currency };
}

// Consume a kid's available points into a pending conversion row (DB side only).
// The HTTP push to AbaBank happens in the server action; retry is idempotent
// on external_id. Returns the created conversion (or an error).
export function cashOut(kidId) {
  const d = db();
  const { pointsPerDollar, currency } = getBankConfig();
  const kid = getKid(kidId);
  if (!kid) return { ok: false, error: "unknown kid" };
  if (!kid.ababank_ref) return { ok: false, error: "no AbaBank mapping for this kid" };
  const points = kidBalance(kidId);
  if (points <= 0) return { ok: false, error: "no points to cash out" };
  const cents = centsForPoints(points, pointsPerDollar);
  if (cents <= 0) return { ok: false, error: "points worth less than 1 cent" };

  const externalId = `hc-${kidId}-${Date.now()}`;
  let convId;
  d.exec("BEGIN");
  try {
    convId = d
      .prepare(
        `INSERT INTO conversion(kid_id,points,amount_cents,currency,external_id,status)
         VALUES(?,?,?,?,?, 'pending')`
      )
      .run(kidId, points, cents, currency, externalId).lastInsertRowid;
    d.prepare("UPDATE earn_event SET consumed_by_bank=1 WHERE kid_id=? AND consumed_by_bank=0").run(kidId);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    return { ok: false, error: String(e.message || e) };
  }
  return { ok: true, conversion: getConversion(convId) };
}

export function getConversion(id) {
  return db().prepare("SELECT * FROM conversion WHERE id=?").get(id);
}
export function updateConversionResult(id, { status, ababankTxId = null, error = null }) {
  db()
    .prepare("UPDATE conversion SET status=?, ababank_tx_id=?, error=? WHERE id=?")
    .run(status, ababankTxId, error, id);
}
export function listConversions(limit = 40) {
  return db()
    .prepare(
      `SELECT c.*, k.name AS kid_name, k.emoji AS kid_emoji, k.color AS kid_color
       FROM conversion c JOIN kid k ON k.id=c.kid_id
       ORDER BY c.id DESC LIMIT ?`
    )
    .all(limit);
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
