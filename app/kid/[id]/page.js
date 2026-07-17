import Link from "next/link";
import { notFound } from "next/navigation";
import { getKidDay, getKid } from "@/lib/domain.js";
import { doneAction } from "@/app/actions.js";

export const dynamic = "force-dynamic";

function DoneButton({ taskId, kidId }) {
  return (
    <form action={doneAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="kidId" value={kidId} />
      <button className="btn big" type="submit">Done!</button>
    </form>
  );
}

function TaskRow({ t, kidId, showStreak }) {
  return (
    <div className="task">
      <div className="emoji">{t.emoji}</div>
      <div className="body">
        <div className="tname">{t.name}</div>
        <div className="meta">
          <span className="pts">+{t.points_snapshot} pts</span>
          {showStreak && t.status !== "missed" && (
            <span className="flame">🔥 {t.streak}</span>
          )}
        </div>
      </div>
      {t.status === "open" && <DoneButton taskId={t.id} kidId={kidId} />}
      {t.status === "pending" && <span className="pill pending">⏳ waiting</span>}
      {t.status === "approved" && <span className="pill done">✓ done</span>}
    </div>
  );
}

function ToddlerCard({ t, kidId }) {
  if (t.status === "open") {
    return (
      <form action={doneAction} className="tcard-form">
        <input type="hidden" name="taskId" value={t.id} />
        <input type="hidden" name="kidId" value={kidId} />
        <button className="tcard" type="submit">
          <div className="temoji">{t.emoji}</div>
          <div className="tname">{t.name}</div>
          <div className="ttap">tap when done 👆</div>
        </button>
      </form>
    );
  }
  return (
    <div className={`tcard ${t.status === "approved" ? "tdone" : "tpending"}`}>
      <div className="temoji">{t.emoji}</div>
      <div className="tname">{t.name}</div>
      <div className="tstate">{t.status === "approved" ? "✓ yay!" : "⏳ waiting"}</div>
    </div>
  );
}

function ToddlerView({ kid, assigned, alt = [], balance }) {
  const stars = "⭐".repeat(Math.min(10, Math.max(0, Math.round(balance / 10))));
  const myTurns = alt.filter((o) => o.ownerKidId === kid.id && o.task && o.task.status !== "approved");
  const cards = assigned.length + myTurns.length;
  return (
    <main className="wrap toddler">
      <div className="topbar">
        <Link className="back big-back" href="/">‹</Link>
        <div className="thero">
          <div className="kid-avatar" style={{ background: kid.color }}>{kid.emoji}</div>
          <div className="tbig-name">{kid.name}</div>
        </div>
      </div>
      <div className="tstars">{stars || "⭐"} <span className="tstars-num">{balance}</span></div>
      <div className="tgrid">
        {cards === 0 && <div className="empty">No chores today! 🎈</div>}
        {assigned.map((t) => <ToddlerCard key={t.id} t={t} kidId={kid.id} />)}
        {myTurns.map((o) => <ToddlerCard key={`a${o.alt.id}`} t={o.task} kidId={kid.id} />)}
      </div>
    </main>
  );
}

function AltRow({ o, kidId }) {
  const mine = o.ownerKidId === kidId;
  const turnLabel = mine ? "Your turn!" : `${o.ownerEmoji} ${o.ownerName}’s turn`;
  return (
    <div className="task">
      <div className="emoji">{o.alt.emoji}</div>
      <div className="body">
        <div className="tname">{o.alt.name}</div>
        <div className="meta">
          <span className="pts">+{o.alt.points} pts</span>
          <span className="flame" style={{ color: mine ? "var(--good)" : "var(--muted)" }}>🔁 {turnLabel}</span>
        </div>
      </div>
      {o.isMine && <DoneButton taskId={o.task.id} kidId={kidId} />}
      {mine && o.task?.status === "pending" && <span className="pill pending">⏳ waiting</span>}
      {mine && o.task?.status === "approved" && <span className="pill done">✓ done</span>}
    </div>
  );
}

export default async function KidPage({ params }) {
  const { id } = await params;
  const kidId = Number(id);
  if (!getKid(kidId)) notFound();

  const { kid, assigned, board, alt, balance } = getKidDay(kidId);
  if (kid.toddler) return <ToddlerView kid={kid} assigned={assigned} alt={alt} balance={balance} />;
  const doneCount = assigned.filter((t) => t.status === "approved").length;

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="back" href="/">‹ Home</Link>
        <Link className="link-btn" href={`/kid/${kidId}/stats`}>📊 My progress</Link>
      </div>

      <div className="kid-hero">
        <div className="kid-avatar" style={{ background: kid.color }}>{kid.emoji}</div>
        <div>
          <div className="name">{kid.name}</div>
          <div className="muted">{doneCount}/{assigned.length} chores done today</div>
        </div>
        <div className="balance-pill">⭐ {balance}</div>
      </div>

      <div className="section-title">Today’s chores</div>
      {assigned.length === 0 && <div className="empty">No chores set. Ask a parent to add some!</div>}
      {assigned.map((t) => (
        <TaskRow key={t.id} t={t} kidId={kidId} showStreak />
      ))}

      {alt.length > 0 && (
        <>
          <div className="section-title">🔁 Shared jobs — taking turns</div>
          {alt.map((o) => <AltRow key={o.alt.id} o={o} kidId={kidId} />)}
        </>
      )}

      <div className="section-title">Up for grabs — anyone can do these</div>
      {board.length === 0 && <div className="empty">Nothing on the board right now. 🎉</div>}
      {board.map((t) => (
        <div className="task" key={t.id}>
          <div className="emoji">{t.emoji}</div>
          <div className="body">
            <div className="tname">{t.name}</div>
            <div className="meta">
              <span className="pts">+{t.points_snapshot} pts</span>
              {t.status === "pending" && t.done_by_name && (
                <span>done by {t.done_by_emoji} {t.done_by_name}</span>
              )}
            </div>
          </div>
          {t.status === "open" && <DoneButton taskId={t.id} kidId={kidId} />}
          {t.status === "pending" && <span className="pill pending">⏳ waiting</span>}
        </div>
      ))}
    </main>
  );
}
