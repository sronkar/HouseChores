import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getKids, listTemplates, listAltChores, getBoard, listBoardTemplates, listExcused, getSetting,
} from "@/lib/domain.js";
import {
  isParent,
  addKidAction, updateKidAction,
  addTemplateAction, updateTemplateAction, deleteTemplateAction,
  addAltAction, updateAltAction, deleteAltAction,
  cloneTemplateAction, cloneAltAction, cloneBoardAction,
  addBoardAction, deleteTaskAction,
  updateBoardTemplateAction, deleteBoardTemplateAction, cloneBoardTemplateAction,
  addExcusedAction, deleteExcusedAction, setPinAction,
} from "@/app/actions.js";

const CADENCES = [
  { v: "daily", label: "Daily — new kid each day" },
  { v: "on_completion", label: "On completion — baton passes when done" },
  { v: "weekly", label: "Weekly — new kid each week" },
];

const DOW = [
  { v: 0, s: "Sun" }, { v: 1, s: "Mon" }, { v: 2, s: "Tue" }, { v: 3, s: "Wed" },
  { v: 4, s: "Thu" }, { v: 5, s: "Fri" }, { v: 6, s: "Sat" },
];
function WeekdayChecks({ selected = [] }) {
  return (
    <div className="checks">
      {DOW.map((d) => (
        <label key={d.v}>
          <input type="checkbox" name="wd" value={d.v} defaultChecked={selected.includes(d.v)} />
          {d.s}
        </label>
      ))}
    </div>
  );
}
function dowLabel(arr) {
  if (!arr || arr.length === 0) return "every day";
  return arr.map((v) => DOW[v].s).join(", ");
}

export const dynamic = "force-dynamic";

function KidChecks({ kids, selected = [] }) {
  return (
    <div className="checks">
      {kids.map((k) => (
        <label key={k.id}>
          <input type="checkbox" name="kidIds" value={k.id} defaultChecked={selected.includes(k.id)} />
          {k.emoji} {k.name}
        </label>
      ))}
    </div>
  );
}

export default async function AdminPage({ searchParams }) {
  if (!(await isParent())) redirect("/parent");
  const sp = await searchParams;
  const tab = sp?.tab === "chores" ? "chores" : "kids";

  const kids = getKids();
  const templates = listTemplates();
  const alts = listAltChores();
  const board = getBoard().filter((t) => !t.board_template_id);
  const boardTemplates = listBoardTemplates();
  const excused = listExcused();
  const pin = getSetting("parent_pin");

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="back" href="/parent">‹ Parent</Link>
        <h1 style={{ fontSize: 22 }}>Admin</h1>
      </div>

      <div className="tabs">
        <Link className={`tab ${tab === "kids" ? "active" : ""}`} href="/parent/admin?tab=kids">🧒 Kids</Link>
        <Link className={`tab ${tab === "chores" ? "active" : ""}`} href="/parent/admin?tab=chores">🧹 Chores</Link>
      </div>

      {tab === "kids" && (<>
      {/* KIDS */}
      <div className="section-title">Kids</div>
      {kids.map((k) => (
        <div className="card" key={k.id}>
          <form action={updateKidAction} className="row">
            <input type="hidden" name="id" value={k.id} />
            <div style={{ flex: "0 0 80px" }}>
              <label>Emoji</label>
              <input type="text" name="emoji" defaultValue={k.emoji} />
            </div>
            <div><label>Name</label><input type="text" name="name" defaultValue={k.name} /></div>
            <div style={{ flex: "0 0 90px" }}>
              <label>Color</label>
              <input type="text" name="color" defaultValue={k.color} />
            </div>
            <div className="checks" style={{ flex: "0 0 auto", alignSelf: "center" }}>
              <label><input type="checkbox" name="toddler" defaultChecked={!!k.toddler} /> 🧸 Toddler mode</label>
            </div>
            <button className="btn ghost" type="submit">Save</button>
          </form>
        </div>
      ))}
      <div className="card">
        <h3>Add a kid</h3>
        <form action={addKidAction} className="row">
          <div style={{ flex: "0 0 80px" }}><label>Emoji</label><input type="text" name="emoji" defaultValue="🙂" /></div>
          <div><label>Name</label><input type="text" name="name" placeholder="Name" /></div>
          <div style={{ flex: "0 0 90px" }}><label>Color</label><input type="text" name="color" defaultValue="#5b8def" /></div>
          <div className="checks" style={{ flex: "0 0 auto", alignSelf: "center" }}>
            <label><input type="checkbox" name="toddler" /> 🧸 Toddler</label>
          </div>
          <button className="btn" type="submit">Add</button>
        </form>
      </div>
      </>)}

      {tab === "chores" && (<>
      {/* RECURRING */}
      <div className="section-title">Recurring chores (daily)</div>
      {templates.map((t) => (
        <div className="card" key={t.id}>
          <form action={updateTemplateAction}>
            <input type="hidden" name="id" value={t.id} />
            <div className="row">
              <div style={{ flex: "0 0 80px" }}><label>Emoji</label><input type="text" name="emoji" defaultValue={t.emoji} /></div>
              <div><label>Name</label><input type="text" name="name" defaultValue={t.name} /></div>
              <div style={{ flex: "0 0 100px" }}><label>Points</label><input type="number" name="points" defaultValue={t.points} min="0" /></div>
            </div>
            <div className="row">
              <div style={{ flex: "0 0 150px" }}><label>Streak award (0=off)</label><input type="number" name="streak_award" defaultValue={t.streak_award || 0} min="0" /></div>
              <div style={{ flex: "0 0 130px" }}><label>every N days</label><input type="number" name="streak_interval" defaultValue={t.streak_interval || 10} min="1" /></div>
              <div style={{ flex: "0 0 160px" }}><label>+bonus each N days</label><input type="number" name="streak_step" defaultValue={t.streak_step ?? 1} min="0" /></div>
            </div>
            <label>Who does it</label>
            <KidChecks kids={kids} selected={t.kidIds} />
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn ghost" type="submit">Save</button>
            </div>
          </form>
          <div style={{ display: "flex", gap: 8, marginTop: -52 }}>
            <form action={cloneTemplateAction}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn gray" type="submit">Clone</button>
            </form>
            <form action={deleteTemplateAction}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn gray" type="submit">Remove</button>
            </form>
          </div>
        </div>
      ))}
      <div className="card">
        <h3>Add a recurring chore</h3>
        <form action={addTemplateAction}>
          <div className="row">
            <div style={{ flex: "0 0 80px" }}><label>Emoji</label><input type="text" name="emoji" defaultValue="✅" /></div>
            <div><label>Name</label><input type="text" name="name" placeholder="e.g. Read" /></div>
            <div style={{ flex: "0 0 100px" }}><label>Points</label><input type="number" name="points" defaultValue="5" min="0" /></div>
          </div>
          <div className="row">
            <div style={{ flex: "0 0 150px" }}><label>Streak award (0=off)</label><input type="number" name="streak_award" defaultValue="0" min="0" /></div>
            <div style={{ flex: "0 0 130px" }}><label>every N days</label><input type="number" name="streak_interval" defaultValue="10" min="1" /></div>
            <div style={{ flex: "0 0 160px" }}><label>+bonus each N days</label><input type="number" name="streak_step" defaultValue="1" min="0" /></div>
          </div>
          <label>Who does it</label>
          <KidChecks kids={kids} />
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn" type="submit">Add chore</button>
          </div>
        </form>
      </div>

      {/* ALTERNATING */}
      <div className="section-title">Alternating chores (rotate between kids)</div>
      {alts.map((a) => (
        <div className="card" key={a.id}>
          <form action={updateAltAction}>
            <input type="hidden" name="id" value={a.id} />
            <div className="row">
              <div style={{ flex: "0 0 80px" }}><label>Emoji</label><input type="text" name="emoji" defaultValue={a.emoji} /></div>
              <div><label>Name</label><input type="text" name="name" defaultValue={a.name} /></div>
              <div style={{ flex: "0 0 90px" }}><label>Points</label><input type="number" name="points" defaultValue={a.points} min="0" /></div>
            </div>
            <label>Rotation cadence</label>
            <select name="cadence" defaultValue={a.cadence}>
              {CADENCES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
            <label>Rotate between (in order)</label>
            <KidChecks kids={kids} selected={a.kidIds} />
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn ghost" type="submit">Save</button>
            </div>
          </form>
          <div style={{ display: "flex", gap: 8, marginTop: -52 }}>
            <form action={cloneAltAction}>
              <input type="hidden" name="id" value={a.id} />
              <button className="btn gray" type="submit">Clone</button>
            </form>
            <form action={deleteAltAction}>
              <input type="hidden" name="id" value={a.id} />
              <button className="btn gray" type="submit">Remove</button>
            </form>
          </div>
        </div>
      ))}
      <div className="card">
        <h3>Add an alternating chore</h3>
        <form action={addAltAction}>
          <div className="row">
            <div style={{ flex: "0 0 80px" }}><label>Emoji</label><input type="text" name="emoji" defaultValue="🔁" /></div>
            <div><label>Name</label><input type="text" name="name" placeholder="e.g. Walk the dog" /></div>
            <div style={{ flex: "0 0 90px" }}><label>Points</label><input type="number" name="points" defaultValue="5" min="0" /></div>
          </div>
          <label>Rotation cadence</label>
          <select name="cadence" defaultValue="daily">
            {CADENCES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
          <label>Rotate between (in order)</label>
          <KidChecks kids={kids} />
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn" type="submit">Add rotating chore</button>
          </div>
        </form>
      </div>

      {/* BOARD */}
      <div className="section-title">Board — one-off tasks</div>
      {board.map((t) => (
        <div className="list-item card" key={t.id} style={{ marginBottom: 10 }}>
          <span className="emoji" style={{ fontSize: 26 }}>{t.emoji}</span>
          <span className="grow"><b>{t.name}</b> <span className="pts">+{t.points_snapshot}</span>
            {t.status === "pending" && <span className="pill pending" style={{ marginLeft: 8 }}>⏳ waiting</span>}
          </span>
          <form action={cloneBoardAction}>
            <input type="hidden" name="id" value={t.id} />
            <button className="btn gray" type="submit">Clone</button>
          </form>
          <form action={deleteTaskAction}>
            <input type="hidden" name="id" value={t.id} />
            <button className="btn gray" type="submit">Remove</button>
          </form>
        </div>
      ))}
      <div className="card">
        <h3>Post a board task</h3>
        <form action={addBoardAction}>
          <div className="row">
            <div style={{ flex: "0 0 80px" }}><label>Emoji</label><input type="text" name="emoji" defaultValue="📌" /></div>
            <div><label>Name</label><input type="text" name="name" placeholder="e.g. Take out trash" /></div>
            <div style={{ flex: "0 0 100px" }}><label>Points</label><input type="number" name="points" defaultValue="5" min="0" /></div>
          </div>
          <label>Repeat on (leave empty = one-time)</label>
          <WeekdayChecks />
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn" type="submit">Post</button>
          </div>
        </form>
      </div>

      {/* RECURRING BOARD */}
      <div className="section-title">Recurring board tasks (by weekday)</div>
      {boardTemplates.length === 0 && (
        <div className="empty">None yet — add one above by picking repeat days.</div>
      )}
      {boardTemplates.map((b) => (
        <div className="card" key={b.id}>
          <form action={updateBoardTemplateAction}>
            <input type="hidden" name="id" value={b.id} />
            <div className="row">
              <div style={{ flex: "0 0 80px" }}><label>Emoji</label><input type="text" name="emoji" defaultValue={b.emoji} /></div>
              <div><label>Name</label><input type="text" name="name" defaultValue={b.name} /></div>
              <div style={{ flex: "0 0 100px" }}><label>Points</label><input type="number" name="points" defaultValue={b.points} min="0" /></div>
            </div>
            <label>Repeat on — <span className="muted">currently {dowLabel(b.weekdaysArr)}</span></label>
            <WeekdayChecks selected={b.weekdaysArr} />
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn ghost" type="submit">Save</button>
            </div>
          </form>
          <div style={{ display: "flex", gap: 8, marginTop: -52 }}>
            <form action={cloneBoardTemplateAction}>
              <input type="hidden" name="id" value={b.id} />
              <button className="btn gray" type="submit">Clone</button>
            </form>
            <form action={deleteBoardTemplateAction}>
              <input type="hidden" name="id" value={b.id} />
              <button className="btn gray" type="submit">Remove</button>
            </form>
          </div>
        </div>
      ))}
      </>)}

      {tab === "kids" && (<>
      {/* EXCUSED */}
      <div className="section-title">Excused days (freeze streaks — vacation, sick)</div>
      {excused.map((e) => (
        <div className="list-item card" key={e.id} style={{ marginBottom: 10 }}>
          <span className="grow">
            <b>{e.kid_name || "Whole family"}</b> · {e.start_date} → {e.end_date}
            {e.reason ? ` · ${e.reason}` : ""}
          </span>
          <form action={deleteExcusedAction}>
            <input type="hidden" name="id" value={e.id} />
            <button className="btn gray" type="submit">Remove</button>
          </form>
        </div>
      ))}
      <div className="card">
        <h3>Add excused range</h3>
        <form action={addExcusedAction}>
          <div className="row">
            <div><label>Who</label>
              <select name="kidId" defaultValue="">
                <option value="">Whole family</option>
                {kids.map((k) => <option key={k.id} value={k.id}>{k.emoji} {k.name}</option>)}
              </select>
            </div>
            <div><label>From</label><input type="date" name="start" /></div>
            <div><label>To</label><input type="date" name="end" /></div>
          </div>
          <label>Reason (optional)</label>
          <input type="text" name="reason" placeholder="Vacation, sick day…" />
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn" type="submit">Add</button>
          </div>
        </form>
      </div>

      {/* PIN */}
      <div className="section-title">Parent PIN</div>
      <div className="card">
        <form action={setPinAction} className="row">
          <div><label>Change PIN (4–8 digits) — current: {pin}</label>
            <input type="text" name="pin" inputMode="numeric" placeholder="New PIN" /></div>
          <button className="btn ghost" type="submit">Update</button>
        </form>
      </div>
      </>)}
    </main>
  );
}
