import Link from "next/link";
import { getKids, kidBalance } from "@/lib/domain.js";

export const dynamic = "force-dynamic";

export default function Home() {
  const kids = getKids().map((k) => ({ ...k, balance: kidBalance(k.id) }));
  return (
    <main className="wrap">
      <div className="topbar">
        <h1>🏡 HouseChores</h1>
        <Link className="link-btn" href="/parent">Parent ›</Link>
      </div>

      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Tap your name to see today’s chores.
      </p>

      <div className="kid-grid">
        {kids.map((k) => (
          <Link key={k.id} href={`/kid/${k.id}`} className="kid-card">
            <div className="kid-avatar" style={{ background: k.color }}>{k.emoji}</div>
            <div className="kid-name">{k.name}</div>
            <div className="kid-balance">⭐ {k.balance} points</div>
          </Link>
        ))}
        {kids.length === 0 && (
          <div className="empty">No kids yet. Go to Parent → Admin to add them.</div>
        )}
      </div>
    </main>
  );
}
