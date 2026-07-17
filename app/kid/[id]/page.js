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

export default async function KidPage({ params }) {
  const { id } = await params;
  const kidId = Number(id);
  if (!getKid(kidId)) notFound();

  const { kid, assigned, board, balance } = getKidDay(kidId);
  const doneCount = assigned.filter((t) => t.status === "approved").length;

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="back" href="/">‹ Home</Link>
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
