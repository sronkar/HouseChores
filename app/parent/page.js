import Link from "next/link";
import { pendingQueue, familyOverview, listAltChores, getKids, getKid } from "@/lib/domain.js";
import {
  isParent, loginAction, logoutAction,
  approveAction, rejectAction, approveAllAction, overrideAltAction,
} from "@/app/actions.js";

export const dynamic = "force-dynamic";

function PinGate({ error }) {
  return (
    <main className="wrap">
      <div className="pin-wrap">
        <h1>🔒 Parent mode</h1>
        <div className="card">
          <form action={loginAction}>
            <label htmlFor="pin">Enter PIN</label>
            <input id="pin" name="pin" type="password" inputMode="numeric"
              autoComplete="off" autoFocus placeholder="••••" />
            {error && <div className="err">Wrong PIN, try again.</div>}
            <button className="btn big" style={{ width: "100%", marginTop: 14 }} type="submit">
              Unlock
            </button>
          </form>
        </div>
        <Link className="muted" href="/">‹ Back to home</Link>
      </div>
    </main>
  );
}

export default async function ParentPage({ searchParams }) {
  const sp = await searchParams;
  if (!(await isParent())) return <PinGate error={sp?.e === "1"} />;

  const pending = pendingQueue();
  const family = familyOverview();
  const alts = listAltChores();
  const kids = getKids();

  return (
    <main className="wrap">
      <div className="topbar">
        <h1>👋 Parent</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="link-btn" href="/parent/bank">🏛️ Bank</Link>
          <Link className="link-btn" href="/parent/history">History</Link>
          <Link className="link-btn" href="/parent/admin">Admin</Link>
          <Link className="link-btn" href="/">Home</Link>
          <form action={logoutAction}><button className="link-btn" type="submit">Lock</button></form>
        </div>
      </div>

      <div className="section-title" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Waiting for approval ({pending.length})</span>
        {pending.length > 0 && (
          <form action={approveAllAction}>
            <button className="btn good" type="submit">Approve all</button>
          </form>
        )}
      </div>

      {pending.length === 0 && <div className="empty">All caught up. 🎉</div>}
      {pending.map((t) => (
        <div className="task" key={t.id}>
          <div className="kid-avatar" style={{ background: t.kid_color, width: 46, height: 46, fontSize: 24, margin: 0 }}>
            {t.kid_emoji}
          </div>
          <div className="body">
            <div className="tname">{t.emoji} {t.name}</div>
            <div className="meta">
              <span>{t.kid_name}</span>
              <span className="pts">+{t.points_snapshot}{t.bonus > 0 ? ` +${t.bonus} 🎁` : ""} pts</span>
              <span>{t.source === "board" ? "board" : t.source === "alt" ? "🔁 rotating" : "daily"}</span>
            </div>
          </div>
          <form action={approveAction}>
            <input type="hidden" name="taskId" value={t.id} />
            <button className="btn good" type="submit">✓</button>
          </form>
          <form action={rejectAction}>
            <input type="hidden" name="taskId" value={t.id} />
            <button className="btn bad" type="submit">✗</button>
          </form>
        </div>
      ))}

      {alts.length > 0 && (
        <>
          <div className="section-title">🔁 Rotating jobs today — override if needed</div>
          {alts.map((a) => {
            const owner = a.currentOwnerKidId ? getKid(a.currentOwnerKidId) : null;
            const rotationKids = kids.filter((k) => a.kidIds.includes(k.id));
            return (
              <div className="task" key={a.id}>
                <div className="emoji">{a.emoji}</div>
                <div className="body">
                  <div className="tname">{a.name}</div>
                  <div className="meta">
                    <span>today: {owner ? `${owner.emoji} ${owner.name}` : "—"}</span>
                  </div>
                </div>
                <form action={overrideAltAction} style={{ display: "flex", gap: 8 }}>
                  <input type="hidden" name="altId" value={a.id} />
                  <select name="kidId" defaultValue={a.currentOwnerKidId || ""}>
                    {rotationKids.map((k) => (
                      <option key={k.id} value={k.id}>{k.emoji} {k.name}</option>
                    ))}
                  </select>
                  <button className="btn ghost" type="submit">Set</button>
                </form>
              </div>
            );
          })}
        </>
      )}

      <div className="section-title">Family this week</div>
      {family.map((k) => (
        <div className="card" key={k.id}>
          <div className="list-item" style={{ borderBottom: "none", paddingBottom: 6 }}>
            <div className="kid-avatar" style={{ background: k.color, width: 44, height: 44, fontSize: 22, margin: 0 }}>
              {k.emoji}
            </div>
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: 20 }}>{k.name}</div>
              <div className="muted">⭐ {k.balance} pts · {k.weekPoints} this week</div>
            </div>
          </div>
          <div style={{ paddingLeft: 4 }}>
            {k.streaks.filter((s) => s.streak > 0).map((s) => (
              <span className="tag" key={s.name}>{s.emoji} {s.name} 🔥{s.streak}</span>
            ))}
            {k.streaks.every((s) => s.streak === 0) && <span className="muted">No active streaks yet</span>}
          </div>
        </div>
      ))}
    </main>
  );
}
