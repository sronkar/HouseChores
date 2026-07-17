import Link from "next/link";
import { redirect } from "next/navigation";
import { isParent } from "@/app/actions.js";
import {
  saveBankConfigAction, setKidRefAction, cashOutAction, retryConversionAction,
} from "@/app/actions.js";
import {
  getKids, getBankConfig, kidBalance, centsForPoints, formatMoney, listConversions,
} from "@/lib/domain.js";

export const dynamic = "force-dynamic";

const CURRENCIES = ["USD", "ILS", "EUR", "GBP", "CAD", "AUD"];

export default async function BankPage() {
  if (!(await isParent())) redirect("/parent");

  const cfg = getBankConfig();
  const kids = getKids();
  const conversions = listConversions(30);
  const configured = !!(cfg.url && cfg.token);

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="back" href="/parent">‹ Parent</Link>
        <h1 style={{ fontSize: 22 }}>🏛️ AbaBank</h1>
      </div>

      {/* config */}
      <div className="section-title">Connection</div>
      <div className="card">
        <form action={saveBankConfigAction}>
          <label>AbaBank URL</label>
          <input type="text" name="url" defaultValue={cfg.url} placeholder="https://ababank.fly.dev" />
          <label>Ingest token (matches AbaBank’s CHORES_INGEST_TOKEN)</label>
          <input type="text" name="token" defaultValue={cfg.token} placeholder="shared secret" />
          <div className="row" style={{ marginTop: 6 }}>
            <div style={{ flex: "0 0 180px" }}>
              <label>Points per {cfg.currency === "USD" ? "dollar" : "unit"}</label>
              <input type="number" name="points_per_dollar" defaultValue={cfg.pointsPerDollar} min="1" />
            </div>
            <div style={{ flex: "0 0 140px" }}>
              <label>Currency</label>
              <select name="currency" defaultValue={cfg.currency}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button className="btn ghost" type="submit">Save</button>
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            {configured
              ? `Connected. ${cfg.pointsPerDollar} pts = ${formatMoney(100, cfg.currency)}.`
              : "Not configured — set URL + token to enable cash-out."}
          </div>
        </form>
      </div>

      {/* per-kid cash out */}
      <div className="section-title">Cash out points → money</div>
      {kids.map((k) => {
        const pts = kidBalance(k.id);
        const cents = centsForPoints(pts, cfg.pointsPerDollar);
        const canCash = configured && !!k.ababank_ref && pts > 0;
        return (
          <div className="card" key={k.id}>
            <div className="list-item" style={{ borderBottom: "none" }}>
              <div className="kid-avatar" style={{ background: k.color, width: 44, height: 44, fontSize: 22, margin: 0 }}>
                {k.emoji}
              </div>
              <div className="grow">
                <div style={{ fontWeight: 800, fontSize: 19 }}>{k.name}</div>
                <div className="muted">⭐ {pts} pts · {formatMoney(cents, cfg.currency)}</div>
              </div>
              <form action={cashOutAction}>
                <input type="hidden" name="kidId" value={k.id} />
                <button className="btn good" type="submit" disabled={!canCash}
                  title={!k.ababank_ref ? "Set AbaBank name below" : pts === 0 ? "No points" : ""}>
                  Cash out
                </button>
              </form>
            </div>
            <form action={setKidRefAction} className="row" style={{ marginTop: 6 }}>
              <input type="hidden" name="kidId" value={k.id} />
              <div>
                <label>AbaBank kid (exact name or numeric id)</label>
                <input type="text" name="ref" defaultValue={k.ababank_ref || ""} placeholder="e.g. Maya" />
              </div>
              <button className="btn gray" type="submit">Map</button>
            </form>
          </div>
        );
      })}

      {/* history */}
      <div className="section-title">Cash-out history</div>
      <div className="card">
        {conversions.length === 0 && <span className="muted">No cash-outs yet.</span>}
        {conversions.map((c) => (
          <div className="list-item" key={c.id}>
            <div className="kid-avatar" style={{ background: c.kid_color, width: 38, height: 38, fontSize: 19, margin: 0 }}>
              {c.kid_emoji}
            </div>
            <span className="grow">
              <b>{c.kid_name}</b> · {c.points} pts → {formatMoney(c.amount_cents, c.currency)}
              {c.error && <div className="err" style={{ fontSize: 13 }}>{c.error}</div>}
            </span>
            <span className={`pill ${c.status === "sent" ? "done" : c.status === "failed" ? "" : "pending"}`}
              style={c.status === "failed" ? { background: "#fde2e2", color: "#b23b3b" } : {}}>
              {c.status === "sent" ? "✓ sent" : c.status === "failed" ? "✗ failed" : "⏳ pending"}
            </span>
            {c.status === "failed" && (
              <form action={retryConversionAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn ghost" type="submit">Retry</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
