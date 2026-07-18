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

// Wipe all activity (points, streaks, completion history, cash-outs) while
// keeping setup: kids, chores, rotations, excused days, settings. Rotation
// pointers reset so on-completion chores start fresh.
export function resetActivity() {
  const d = db();
  const counts = {
    earns: d.prepare("SELECT COUNT(*) c FROM earn_event").get().c,
    tasks: d.prepare("SELECT COUNT(*) c FROM task").get().c,
    conversions: d.prepare("SELECT COUNT(*) c FROM conversion").get().c,
  };
  d.exec("BEGIN");
  try {
    d.exec("DELETE FROM earn_event");
    d.exec("DELETE FROM task");
    d.exec("DELETE FROM conversion");
    d.exec("UPDATE alt_chore SET turn_index=0");
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return counts;
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
const posInt = (v, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : dflt;
};
export function addTemplate({
  name, emoji = "✅", points = 5, kidIds = [],
  streakAward = 0, streakInterval = 10, streakStep = 1,
}) {
  const d = db();
  const id = d
    .prepare(
      "INSERT INTO chore_template(name,emoji,points,streak_award,streak_interval,streak_step) VALUES(?,?,?,?,?,?)"
    )
    .run(name, emoji, points, posInt(streakAward, 0), Math.max(1, posInt(streakInterval, 10)), posInt(streakStep, 1))
    .lastInsertRowid;
  const ins = d.prepare("INSERT INTO chore_template_kid(template_id,kid_id) VALUES(?,?)");
  for (const kid of kidIds) ins.run(id, kid);
  return id;
}
export function updateTemplate(id, {
  name, emoji, points, kidIds,
  streakAward = 0, streakInterval = 10, streakStep = 1,
}) {
  const d = db();
  d.prepare(
    "UPDATE chore_template SET name=?, emoji=?, points=?, streak_award=?, streak_interval=?, streak_step=? WHERE id=?"
  ).run(name, emoji, points, posInt(streakAward, 0), Math.max(1, posInt(streakInterval, 10)), posInt(streakStep, 1), id);
  d.prepare("DELETE FROM chore_template_kid WHERE template_id=?").run(id);
  const ins = d.prepare("INSERT INTO chore_template_kid(template_id,kid_id) VALUES(?,?)");
  for (const kid of kidIds) ins.run(id, kid);
}

// Streak bonus for a chore: base award, plus `step` points for every full
// `interval` days of streak.  award = base + floor(streak/interval) * step.
export function streakAwardFor(baseAward, streak, interval = 10, step = 1) {
  if (baseAward <= 0) return 0;
  const N = Math.max(1, interval || 10);
  return baseAward + Math.floor(streak / N) * (step ?? 1);
}
export function deactivateTemplate(id) {
  db().prepare("UPDATE chore_template SET active=0 WHERE id=?").run(id);
}

// ---------- alternating (rotating) shared chores ----------
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
}
function parseKidIds(csv) {
  return String(csv || "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
}
// Active kids in this alt's rotation, in order.
function altRotation(alt) {
  const active = new Set(getKids().map((k) => k.id));
  return parseKidIds(alt.kid_ids).filter((id) => active.has(id));
}
// Base rotation index for a date (before the per-chore phase offset).
function altBaseIndex(alt, date, N) {
  if (alt.cadence === "on_completion") return ((alt.turn_index % N) + N) % N;
  if (alt.cadence === "weekly") return ((Math.floor(daysBetween(alt.anchor_date, date) / 7) % N) + N) % N;
  return ((daysBetween(alt.anchor_date, date) % N) + N) % N; // daily
}
// { ownerKidId, periodKey } for a given date, per cadence + phase offset.
export function altOwnerForDate(alt, date = todayStr()) {
  const kids = altRotation(alt);
  if (kids.length === 0) return null;
  const N = kids.length;
  const idx = (altBaseIndex(alt, date, N) + (alt.turn_offset || 0)) % N;
  const periodKey =
    alt.cadence === "weekly"
      ? addDays(alt.anchor_date, Math.floor(daysBetween(alt.anchor_date, date) / 7) * 7)
      : date;
  return { ownerKidId: kids[idx], periodKey };
}
// Offset that makes `todayKidId` the owner on `today`, given the rotation.
function offsetForTodayOwner(alt, kidIds, todayKidId, today = todayStr()) {
  const N = kidIds.length;
  if (!N) return 0;
  const j = kidIds.indexOf(Number(todayKidId));
  if (j < 0) return 0;
  const base = altBaseIndex({ ...alt, turn_offset: 0 }, today, N);
  return ((j - base) % N + N) % N;
}

export function listAltChores() {
  const alts = db().prepare("SELECT * FROM alt_chore WHERE active=1 ORDER BY id").all();
  for (const a of alts) {
    a.kidIds = parseKidIds(a.kid_ids);
    a.currentOwnerKidId = altOwnerForDate(a)?.ownerKidId ?? null;
  }
  return alts;
}
export function addAltChore({ name, emoji = "🔁", points = 5, kidIds = [], cadence = "daily", todayKidId = null }) {
  const ids = kidIds.filter((n) => Number.isInteger(n) && n > 0);
  const anchor = todayStr();
  const offset = todayKidId ? offsetForTodayOwner({ cadence, anchor_date: anchor, turn_index: 0 }, ids, todayKidId, anchor) : 0;
  return db()
    .prepare(
      `INSERT INTO alt_chore(name,emoji,points,kid_ids,cadence,anchor_date,turn_offset)
       VALUES(?,?,?,?,?,?,?)`
    )
    .run(name, emoji, points, ids.join(","), cadence, anchor, offset).lastInsertRowid;
}
export function updateAltChore(id, { name, emoji, points, kidIds, cadence, todayKidId = null }) {
  const ids = (kidIds || []).filter((n) => Number.isInteger(n) && n > 0);
  const cur = db().prepare("SELECT * FROM alt_chore WHERE id=?").get(id);
  const offset = todayKidId
    ? offsetForTodayOwner({ cadence, anchor_date: cur.anchor_date, turn_index: cur.turn_index }, ids, todayKidId)
    : (cur?.turn_offset || 0);
  db()
    .prepare("UPDATE alt_chore SET name=?, emoji=?, points=?, kid_ids=?, cadence=?, turn_offset=? WHERE id=?")
    .run(name, emoji, points, ids.join(","), cadence, offset, id);
}
// Parent override: make `kidId` today's owner; rotation continues forward.
export function setAltTodayOwner(altId, kidId) {
  const alt = db().prepare("SELECT * FROM alt_chore WHERE id=?").get(altId);
  if (!alt) return;
  const ids = parseKidIds(alt.kid_ids);
  const offset = offsetForTodayOwner(alt, ids, kidId);
  db().prepare("UPDATE alt_chore SET turn_offset=? WHERE id=?").run(offset, altId);
  // move today's open instance to the new owner right away
  const owner = altOwnerForDate({ ...alt, turn_offset: offset });
  if (owner) {
    const period = alt.cadence === "on_completion" ? null : owner.periodKey;
    const row =
      alt.cadence === "on_completion"
        ? db().prepare("SELECT * FROM task WHERE alt_id=? AND status='open' ORDER BY id DESC").get(altId)
        : db().prepare("SELECT * FROM task WHERE alt_id=? AND date=? AND status='open' ORDER BY id DESC").get(altId, period);
    if (row) db().prepare("UPDATE task SET assigned_kid_id=? WHERE id=?").run(owner.ownerKidId, row.id);
  }
}

export function deactivateAltChore(id) {
  db().prepare("UPDATE alt_chore SET active=0 WHERE id=?").run(id);
  db().prepare("UPDATE task SET status='missed' WHERE alt_id=? AND status IN ('open','pending')").run(id);
}

// Create/advance rotating task instances for a date. Idempotent.
export function ensureAltTasks(date = todayStr()) {
  const d = db();
  const alts = d.prepare("SELECT * FROM alt_chore WHERE active=1").all();
  const insAlt = d.prepare(
    `INSERT INTO task(source,alt_id,name,emoji,points_snapshot,date,assigned_kid_id,status)
     VALUES('alt',?,?,?,?,?,?, 'open')`
  );
  for (const alt of alts) {
    const owner = altOwnerForDate(alt, date);
    if (!owner) continue;
    // Retire stale open turns from earlier periods (daily/weekly only).
    if (alt.cadence !== "on_completion") {
      d.prepare("UPDATE task SET status='missed' WHERE alt_id=? AND status='open' AND date<?")
        .run(alt.id, owner.periodKey);
    }
    // Is there already a live instance for the current period?
    const existing =
      alt.cadence === "on_completion"
        ? d.prepare("SELECT * FROM task WHERE alt_id=? AND status IN ('open','pending') ORDER BY id DESC").get(alt.id)
        : d.prepare("SELECT * FROM task WHERE alt_id=? AND date=? ORDER BY id DESC").get(alt.id, owner.periodKey);
    if (!existing) {
      insAlt.run(alt.id, alt.name, alt.emoji, alt.points, owner.periodKey, owner.ownerKidId);
    } else if (existing.status === "open" && existing.assigned_kid_id !== owner.ownerKidId) {
      // a parent re-phased the rotation — move today's open turn to the new owner
      d.prepare("UPDATE task SET assigned_kid_id=? WHERE id=?").run(owner.ownerKidId, existing.id);
    }
  }
}

// Rotating shared jobs for the kid view: whose turn + this kid's actionable turns.
export function altOverview(kidId, date = todayStr()) {
  ensureAltTasks(date);
  const d = db();
  const alts = listAltChores();
  const out = [];
  for (const alt of alts) {
    const owner = altOwnerForDate(alt, date);
    if (!owner) continue;
    const task =
      alt.cadence === "on_completion"
        ? d.prepare("SELECT * FROM task WHERE alt_id=? AND status IN ('open','pending') ORDER BY id DESC").get(alt.id)
        : d.prepare("SELECT * FROM task WHERE alt_id=? AND date=? ORDER BY id DESC").get(alt.id, owner.periodKey);
    const ownerKid = getKid(owner.ownerKidId);
    out.push({
      alt,
      ownerKidId: owner.ownerKidId,
      ownerName: ownerKid?.name,
      ownerEmoji: ownerKid?.emoji,
      cadence: alt.cadence,
      task, // may be null if just approved and awaiting next period
      isMine: owner.ownerKidId === kidId && task && task.status !== "approved",
    });
  }
  return out;
}

// ---------- clone ----------
export function cloneTemplate(id) {
  const d = db();
  const t = d.prepare("SELECT * FROM chore_template WHERE id=?").get(id);
  if (!t) return null;
  const kidIds = d.prepare("SELECT kid_id FROM chore_template_kid WHERE template_id=?").all(id).map((r) => r.kid_id);
  return addTemplate({
    name: t.name + " (copy)", emoji: t.emoji, points: t.points, kidIds,
    streakAward: t.streak_award, streakInterval: t.streak_interval, streakStep: t.streak_step,
  });
}
export function cloneAltChore(id) {
  const a = db().prepare("SELECT * FROM alt_chore WHERE id=?").get(id);
  if (!a) return null;
  return addAltChore({
    name: a.name + " (copy)", emoji: a.emoji, points: a.points,
    kidIds: parseKidIds(a.kid_ids), cadence: a.cadence,
  });
}
export function cloneBoardTask(id) {
  const t = db().prepare("SELECT * FROM task WHERE id=? AND source='board'").get(id);
  if (!t) return null;
  return addBoardChore({ name: t.name, emoji: t.emoji, points: t.points_snapshot });
}

// ---------- daily task generation + missed sweep ----------
// Idempotent: call before reading any day's tasks.
export function ensureDay(date = todayStr()) {
  const d = db();
  // Sweep: past-day recurring 'open' tasks become 'missed'.
  d.prepare("UPDATE task SET status='missed' WHERE source='recurring' AND status='open' AND date<?").run(date);
  ensureAltTasks(date);
  ensureBoardTemplates(date);

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
      `SELECT t.*, ct.streak_award, ct.streak_interval, ct.streak_step FROM task t
       LEFT JOIN chore_template ct ON ct.id=t.template_id
       WHERE t.source='recurring' AND t.assigned_kid_id=? AND t.date=?
       ORDER BY t.id`
    )
    .all(kidId, date);
  for (const t of assigned) {
    t.streak = choreStreak(t.template_id, kidId, date);
    // projected streak once today is completed (open days aren't counted yet)
    const projected = t.streak + (t.status === "open" ? 1 : 0);
    t.bonus = streakAwardFor(t.streak_award || 0, projected, t.streak_interval, t.streak_step);
  }
  const board = getBoard(date);
  const alt = altOverview(kidId, date);
  const activities = activitiesForKid(kidId, date);
  return {
    kid: getKid(kidId),
    date,
    assigned,
    board,
    alt,
    activities,
    balance: kidBalance(kidId),
  };
}

// ---------- board (unassigned claimable tasks) ----------
function dow(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
}
export function getBoard(date = todayStr()) {
  // One-off items persist until approved/removed; recurring (templated) items
  // only show on their day. Pending items always show until decided.
  return db()
    .prepare(
      `SELECT t.*, k.name AS done_by_name, k.emoji AS done_by_emoji
       FROM task t LEFT JOIN kid k ON k.id=t.done_by_kid_id
       WHERE t.source='board' AND (
         t.status='pending'
         OR (t.status='open' AND (t.board_template_id IS NULL OR t.date=?))
       )
       ORDER BY t.id`
    )
    .all(date);
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

// ---------- recurring board tasks (appear on chosen weekdays) ----------
function parseWeekdays(csv) {
  return String(csv || "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}
export function listBoardTemplates() {
  const rows = db().prepare("SELECT * FROM board_template WHERE active=1 ORDER BY id").all();
  for (const r of rows) r.weekdaysArr = parseWeekdays(r.weekdays);
  return rows;
}
export function addBoardTemplate({ name, emoji = "📌", points = 5, weekdays = [] }) {
  const wd = weekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return db()
    .prepare("INSERT INTO board_template(name,emoji,points,weekdays) VALUES(?,?,?,?)")
    .run(name, emoji, points, wd.join(",")).lastInsertRowid;
}
export function updateBoardTemplate(id, { name, emoji, points, weekdays }) {
  const wd = (weekdays || []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  db()
    .prepare("UPDATE board_template SET name=?, emoji=?, points=?, weekdays=? WHERE id=?")
    .run(name, emoji, points, wd.join(","), id);
}
export function deactivateBoardTemplate(id) {
  db().prepare("UPDATE board_template SET active=0 WHERE id=?").run(id);
  db().prepare("UPDATE task SET status='missed' WHERE board_template_id=? AND status IN ('open','pending')").run(id);
}
export function cloneBoardTemplate(id) {
  const t = db().prepare("SELECT * FROM board_template WHERE id=?").get(id);
  if (!t) return null;
  return addBoardTemplate({ name: t.name + " (copy)", emoji: t.emoji, points: t.points, weekdays: parseWeekdays(t.weekdays) });
}

// Generate today's recurring board instances; retire yesterday's undone ones.
export function ensureBoardTemplates(date = todayStr()) {
  const d = db();
  const wd = dow(date);
  const tpls = d.prepare("SELECT * FROM board_template WHERE active=1").all();
  const exists = d.prepare(
    "SELECT 1 FROM task WHERE board_template_id=? AND date=?"
  );
  const ins = d.prepare(
    `INSERT INTO task(source,board_template_id,name,emoji,points_snapshot,date,status)
     VALUES('board',?,?,?,?,?, 'open')`
  );
  // sweep undone recurring board tasks from earlier days
  d.prepare("UPDATE task SET status='missed' WHERE board_template_id IS NOT NULL AND status='open' AND date<?").run(date);
  for (const t of tpls) {
    const days = parseWeekdays(t.weekdays);
    const matches = days.length === 0 || days.includes(wd);
    if (!matches) continue;
    if (exists.get(t.id, date)) continue;
    ins.run(t.id, t.name, t.emoji, t.points, date);
  }
}

// ---------- activities (optional per-kid point earners) ----------
export function listActivities() {
  const rows = db().prepare("SELECT * FROM activity WHERE active=1 ORDER BY id").all();
  for (const r of rows) r.kidIds = parseKidIds(r.kid_ids); // [] = all kids
  return rows;
}
function activityEligible(act, kidId) {
  const ids = parseKidIds(act.kid_ids);
  return ids.length === 0 || ids.includes(kidId);
}
const ACTIVITY_MODES = ["daily", "once", "once_global"];
const normMode = (m) => (ACTIVITY_MODES.includes(m) ? m : "daily");
export function addActivity({ name, emoji = "⭐", points = 5, kidIds = [], mode = "daily" }) {
  const ids = (kidIds || []).filter((n) => Number.isInteger(n) && n > 0);
  return db()
    .prepare("INSERT INTO activity(name,emoji,points,kid_ids,mode) VALUES(?,?,?,?,?)")
    .run(name, emoji, points, ids.join(","), normMode(mode)).lastInsertRowid;
}
export function updateActivity(id, { name, emoji, points, kidIds, mode }) {
  const ids = (kidIds || []).filter((n) => Number.isInteger(n) && n > 0);
  db()
    .prepare("UPDATE activity SET name=?, emoji=?, points=?, kid_ids=?, mode=? WHERE id=?")
    .run(name, emoji, points, ids.join(","), normMode(mode), id);
}
export function deactivateActivity(id) {
  db().prepare("UPDATE activity SET active=0 WHERE id=?").run(id);
}
export function cloneActivity(id) {
  const a = db().prepare("SELECT * FROM activity WHERE id=?").get(id);
  if (!a) return null;
  return addActivity({ name: a.name + " (copy)", emoji: a.emoji, points: a.points, kidIds: parseKidIds(a.kid_ids), mode: a.mode });
}

// The relevant existing log for an activity+kid:
//  daily        → this kid's log today
//  once         → this kid's log ever
//  once_global  → ANY kid's log ever (single shared claim)
function activityTaskFor(activityId, kidId, mode, date) {
  const d = db();
  if (mode === "once_global") {
    return d
      .prepare("SELECT * FROM task WHERE activity_id=? AND status IN ('pending','approved') ORDER BY id DESC")
      .get(activityId);
  }
  if (mode === "once") {
    return d
      .prepare("SELECT * FROM task WHERE activity_id=? AND done_by_kid_id=? AND status IN ('pending','approved') ORDER BY id DESC")
      .get(activityId, kidId);
  }
  return d
    .prepare("SELECT * FROM task WHERE activity_id=? AND done_by_kid_id=? AND date=? AND status IN ('pending','approved') ORDER BY id DESC")
    .get(activityId, kidId, date);
}

// Activities a kid can see: each with its current state for today.
export function activitiesForKid(kidId, date = todayStr()) {
  return listActivities()
    .filter((a) => activityEligible(a, kidId))
    .map((a) => {
      const task = activityTaskFor(a.id, kidId, a.mode, date);
      const mine = task && task.done_by_kid_id === kidId;
      const claimer = task && !mine && a.mode === "once_global" ? getKid(task.done_by_kid_id) : null;
      return {
        activity: a,
        task,
        mine,
        claimer, // set only when someone else claimed a global activity
        canLog: !task,
        status: task?.status ?? null,
      };
    });
}

// Kid logs an activity → pending, awaiting approval. Deduped per window/claim.
export function logActivity(activityId, kidId) {
  const d = db();
  const act = d.prepare("SELECT * FROM activity WHERE id=? AND active=1").get(activityId);
  if (!act || !activityEligible(act, kidId)) return false;
  const today = todayStr();
  if (activityTaskFor(activityId, kidId, act.mode, today)) return false; // already logged / claimed
  d.prepare(
    `INSERT INTO task(source,activity_id,name,emoji,points_snapshot,date,done_by_kid_id,done_at,status)
     VALUES('activity',?,?,?,?,?,?, datetime('now'), 'pending')`
  ).run(activityId, act.name, act.emoji, act.points, today, kidId);
  return true;
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
  const rows = db()
    .prepare(
      `SELECT t.*, ct.streak_award, ct.streak_interval, ct.streak_step,
              k.name AS kid_name, k.emoji AS kid_emoji, k.color AS kid_color
       FROM task t
       JOIN kid k ON k.id = COALESCE(t.done_by_kid_id, t.assigned_kid_id)
       LEFT JOIN chore_template ct ON ct.id=t.template_id
       WHERE t.status='pending'
       ORDER BY t.done_at`
    )
    .all();
  for (const t of rows) {
    // pending already counts today, so choreStreak is the streak we'll credit against
    t.bonus =
      t.source === "recurring" && t.template_id && t.streak_award > 0
        ? streakAwardFor(
            t.streak_award,
            choreStreak(t.template_id, t.done_by_kid_id ?? t.assigned_kid_id, t.date),
            t.streak_interval,
            t.streak_step
          )
        : 0;
  }
  return rows;
}

export function approveTask(taskId) {
  const d = db();
  const t = d.prepare("SELECT * FROM task WHERE id=?").get(taskId);
  if (!t || t.status !== "pending") return false;
  const kidId = t.done_by_kid_id ?? t.assigned_kid_id;
  d.prepare("UPDATE task SET status='approved', approved_at=datetime('now') WHERE id=?").run(taskId);
  // total credited = chore points + streak bonus (recurring chores only).
  let award = t.points_snapshot;
  if (t.source === "recurring" && t.template_id) {
    const tpl = d
      .prepare("SELECT streak_award, streak_interval, streak_step FROM chore_template WHERE id=?")
      .get(t.template_id);
    if (tpl && tpl.streak_award > 0) {
      // streak now includes today (the task just went approved).
      const streak = choreStreak(t.template_id, kidId, t.date);
      award += streakAwardFor(tpl.streak_award, streak, tpl.streak_interval, tpl.streak_step);
    }
  }
  // immutable earn (base points + any streak bonus)
  d.prepare("INSERT INTO earn_event(kid_id,task_id,points) VALUES(?,?,?)").run(kidId, taskId, award);
  // pass-the-baton rotation advances only when the current turn is completed
  if (t.source === "alt" && t.alt_id) {
    const alt = d.prepare("SELECT * FROM alt_chore WHERE id=?").get(t.alt_id);
    if (alt && alt.cadence === "on_completion") {
      const n = altRotation(alt).length;
      if (n > 0) {
        d.prepare("UPDATE alt_chore SET turn_index=? WHERE id=?").run((alt.turn_index + 1) % n, alt.id);
      }
    }
  }
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

// ---------- approval nudge (debounced digest) ----------
export function getNudgeConfig() {
  return {
    channel: getSetting("nudge_channel") || "off", // off | ntfy | whatsapp
    ntfyTopic: getSetting("nudge_ntfy_topic") || "",
    token: getSetting("nudge_token") || "",
    // WhatsApp recipients (JIDs), comma-separated
    recipients: (getSetting("nudge_recipients") || "").split(",").map((s) => s.trim()).filter(Boolean),
    minMinutes: Number(getSetting("nudge_min_minutes") || 25),
  };
}
export function setNudgeConfig(patch) {
  if (patch.channel !== undefined) setSetting("nudge_channel", patch.channel);
  if (patch.ntfyTopic !== undefined) setSetting("nudge_ntfy_topic", patch.ntfyTopic);
  if (patch.token !== undefined) setSetting("nudge_token", patch.token);
  if (patch.recipients !== undefined) setSetting("nudge_recipients", patch.recipients.join(","));
  if (patch.minMinutes !== undefined) setSetting("nudge_min_minutes", String(patch.minMinutes));
}

// Who's waiting for approval, grouped by kid.
export function pendingDigest() {
  const rows = db()
    .prepare(
      `SELECT COALESCE(t.done_by_kid_id, t.assigned_kid_id) AS kid_id, k.name, k.emoji, COUNT(*) AS n
       FROM task t JOIN kid k ON k.id = COALESCE(t.done_by_kid_id, t.assigned_kid_id)
       WHERE t.status='pending' GROUP BY kid_id ORDER BY k.display_order, k.id`
    )
    .all();
  const count = rows.reduce((s, r) => s + r.n, 0);
  return { count, byKid: rows };
}
export function nudgeMessage(digest = pendingDigest()) {
  if (digest.count === 0) return null;
  const who = digest.byKid.map((r) => `${r.emoji} ${r.name} ${r.n}`).join(", ");
  return `🧹 ${digest.count} chore${digest.count === 1 ? "" : "s"} waiting for approval (${who})`;
}
// Debounce: at most one nudge per window. The window resets when the queue
// empties (see syncNudgeBaseline), so you get one ping when a fresh batch of
// chores starts piling up, a reminder if they sit unapproved past the window,
// but NOT a buzz on every individual tap.
export function nudgeDue(count = pendingDigest().count, now = Date.now()) {
  if (count <= 0) return false;
  const lastAt = Number(getSetting("nudge_last_at") || 0);
  const { minMinutes } = getNudgeConfig();
  return now - lastAt >= minMinutes * 60_000;
}
export function markNudged(count, now = Date.now()) {
  setSetting("nudge_last_count", String(count));
  setSetting("nudge_last_at", String(now));
}
// Called after something enters 'pending'. Push channels (ntfy) fire here;
// pull channels (whatsapp) are served by /api/nudge instead.
export async function onPending() {
  const cfg = getNudgeConfig();
  if (cfg.channel !== "ntfy" || !cfg.ntfyTopic) return;
  const digest = pendingDigest();
  if (!nudgeDue(digest.count)) return;
  markNudged(digest.count);
  const { pushNtfy } = await import("./notify.js");
  await pushNtfy(cfg.ntfyTopic, "HouseChores", nudgeMessage(digest)).catch(() => {});
}
// When the queue empties, reset the window so the next fresh batch nudges right
// away instead of waiting out the remainder of the debounce window.
export function syncNudgeBaseline() {
  if (pendingDigest().count === 0) {
    setSetting("nudge_last_count", "0");
    setSetting("nudge_last_at", "0");
  }
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
