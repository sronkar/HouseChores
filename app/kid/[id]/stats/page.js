import Link from "next/link";
import { notFound } from "next/navigation";
import { getKid, kidStats } from "@/lib/domain.js";

export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dowLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DOW[new Date(y, m - 1, d).getDay()];
}

export default async function StatsPage({ params }) {
  const { id } = await params;
  const kidId = Number(id);
  if (!getKid(kidId)) notFound();

  const s = kidStats(kidId);
  const maxPts = Math.max(1, ...s.byDay.map((d) => d.pts));
  const delta = s.weekPoints - s.lastWeekPoints;

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="back" href={`/kid/${kidId}`}>‹ Back</Link>
        <h1 style={{ fontSize: 22 }}>{s.kid.emoji} {s.kid.name}’s progress</h1>
      </div>

      {/* headline tiles */}
      <div className="tiles">
        <div className="tile">
          <div className="tile-num">⭐ {s.balance}</div>
          <div className="tile-label">points to spend</div>
        </div>
        <div className="tile">
          <div className="tile-num">{s.weekPoints}</div>
          <div className="tile-label">
            this week {delta === 0 ? "" : delta > 0 ? `▲ ${delta}` : `▼ ${-delta}`}
          </div>
        </div>
        <div className="tile">
          <div className="tile-num">{s.totalDone}</div>
          <div className="tile-label">chores done</div>
        </div>
        <div className="tile">
          <div className="tile-num">🏆 {s.lifetime}</div>
          <div className="tile-label">points all-time</div>
        </div>
      </div>

      {/* 7-day chart */}
      <div className="section-title">Last 7 days</div>
      <div className="card">
        <div className="chart">
          {s.byDay.map((d) => (
            <div className="chart-col" key={d.date}>
              <div className="chart-val">{d.pts || ""}</div>
              <div
                className="chart-bar"
                style={{ height: `${Math.round((d.pts / maxPts) * 100)}%` }}
                title={`${d.date}: ${d.pts} pts`}
              />
              <div className="chart-x">{dowLabel(d.date)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* streaks */}
      <div className="section-title">Streaks 🔥</div>
      <div className="card">
        {s.streaks.length === 0 && <span className="muted">No recurring chores yet.</span>}
        {s.streaks.map((st) => (
          <div className="list-item" key={st.name}>
            <span className="emoji" style={{ fontSize: 26 }}>{st.emoji}</span>
            <span className="grow"><b>{st.name}</b></span>
            <span className="tag">now 🔥 {st.current}</span>
            <span className="tag" style={{ background: "#fff4d6", color: "#a9791a" }}>best {st.best}</span>
          </div>
        ))}
      </div>

      {/* recent */}
      <div className="section-title">Recently done</div>
      <div className="card">
        {s.recent.length === 0 && <span className="muted">Nothing yet — go earn some points!</span>}
        {s.recent.map((r, i) => (
          <div className="list-item" key={i}>
            <span className="emoji" style={{ fontSize: 24 }}>{r.emoji}</span>
            <span className="grow">{r.name}</span>
            <span className="pts">+{r.points_snapshot}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
