// Optional dev helper: backfill a week of completed chores so stats/charts
// have shape to look at. Safe to run once; re-running adds more history.
import { db } from "../lib/db.js";

function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return todayStr(dt);
}

const database = db();
const today = todayStr();

// How many of the most-recent days each kid tends to complete each chore.
// (kid display_order 0-based) -> days back completed
const kidDepth = [6, 3, 2]; // Kid A very consistent, Kid B medium, Kid C light

const links = database
  .prepare(
    `SELECT ct.template_id, ct.kid_id, ct.rowid, t.name, t.emoji, t.points,
            k.display_order AS ord
     FROM chore_template_kid ct
     JOIN chore_template t ON t.id=ct.template_id
     JOIN kid k ON k.id=ct.kid_id
     WHERE t.active=1`
  )
  .all();

const insTask = database.prepare(
  `INSERT INTO task(source,template_id,name,emoji,points_snapshot,date,assigned_kid_id,done_by_kid_id,done_at,status,approved_at)
   VALUES('recurring',?,?,?,?,?,?,?,?, 'approved', ?)`
);
const existsTask = database.prepare(
  "SELECT id FROM task WHERE source='recurring' AND template_id=? AND assigned_kid_id=? AND date=?"
);
const insEarn = database.prepare(
  "INSERT INTO earn_event(kid_id,task_id,points,created_at) VALUES(?,?,?,?)"
);

let made = 0;
for (const l of links) {
  const depth = kidDepth[l.ord] ?? 3;
  for (let i = 1; i <= depth; i++) {
    const date = addDays(today, -i);
    if (existsTask.get(l.template_id, l.kid_id, date)) continue;
    const ts = `${date} 18:0${i % 6}:00`;
    const taskId = insTask.run(
      l.template_id, l.name, l.emoji, l.points, date, l.kid_id, l.kid_id, ts, ts
    ).lastInsertRowid;
    insEarn.run(l.kid_id, taskId, l.points, ts);
    made++;
  }
}
console.log(`Backfilled ${made} approved chores across the last week.`);
