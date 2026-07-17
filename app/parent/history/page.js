import Link from "next/link";
import { redirect } from "next/navigation";
import { isParent } from "@/app/actions.js";
import { familyHistory } from "@/lib/domain.js";

export const dynamic = "force-dynamic";

function whenLabel(iso) {
  if (!iso) return "";
  // stored as UTC "YYYY-MM-DD HH:MM:SS"
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function HistoryPage() {
  if (!(await isParent())) redirect("/parent");
  const rows = familyHistory(60);

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="back" href="/parent">‹ Parent</Link>
        <h1 style={{ fontSize: 22 }}>Approval history</h1>
      </div>

      <div className="card">
        {rows.length === 0 && <span className="muted">No approvals yet.</span>}
        {rows.map((r, i) => (
          <div className="list-item" key={i}>
            <div className="kid-avatar" style={{ background: r.kid_color, width: 40, height: 40, fontSize: 20, margin: 0 }}>
              {r.kid_emoji}
            </div>
            <span className="grow">
              <b>{r.kid_name}</b> · {r.emoji} {r.name}
              <div className="muted" style={{ fontSize: 13 }}>{whenLabel(r.approved_at)} · {r.source === "board" ? "board" : "daily"}</div>
            </span>
            <span className="pts">+{r.points_snapshot}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
