import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getKids, listTemplates, getBoard, listExcused, getSetting,
} from "@/lib/domain.js";
import {
  isParent,
  addKidAction, updateKidAction,
  addTemplateAction, updateTemplateAction, deleteTemplateAction,
  addBoardAction, deleteTaskAction,
  addExcusedAction, deleteExcusedAction, setPinAction,
} from "@/app/actions.js";

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

export default async function AdminPage() {
  if (!(await isParent())) redirect("/parent");

  const kids = getKids();
  const templates = listTemplates();
  const board = getBoard();
  const excused = listExcused();
  const pin = getSetting("parent_pin");

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="back" href="/parent">‹ Parent</Link>
        <h1 style={{ fontSize: 22 }}>Admin</h1>
      </div>

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
          <button className="btn" type="submit">Add</button>
        </form>
      </div>

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
            <label>Who does it</label>
            <KidChecks kids={kids} selected={t.kidIds} />
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn ghost" type="submit">Save</button>
            </div>
          </form>
          <form action={deleteTemplateAction} style={{ marginTop: -52 }}>
            <input type="hidden" name="id" value={t.id} />
            <button className="btn gray" type="submit">Remove</button>
          </form>
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
          <label>Who does it</label>
          <KidChecks kids={kids} />
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn" type="submit">Add chore</button>
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
          <form action={deleteTaskAction}>
            <input type="hidden" name="id" value={t.id} />
            <button className="btn gray" type="submit">Remove</button>
          </form>
        </div>
      ))}
      <div className="card">
        <h3>Post a board task</h3>
        <form action={addBoardAction} className="row">
          <div style={{ flex: "0 0 80px" }}><label>Emoji</label><input type="text" name="emoji" defaultValue="📌" /></div>
          <div><label>Name</label><input type="text" name="name" placeholder="e.g. Take out trash" /></div>
          <div style={{ flex: "0 0 100px" }}><label>Points</label><input type="number" name="points" defaultValue="5" min="0" /></div>
          <button className="btn" type="submit">Post</button>
        </form>
      </div>

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
    </main>
  );
}
