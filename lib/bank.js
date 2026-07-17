// Outbound client for the AbaBank ingest endpoint. Server-side only.
export async function postChorePayout({ url, token, externalId, ref, amountCents, description, points }) {
  if (!url || !token) return { ok: false, error: "AbaBank URL/token not configured" };

  // ref may be a numeric AbaBank user id or that user's exact name.
  const asNum = Number(ref);
  const target = Number.isInteger(asNum) && String(asNum) === String(ref).trim()
    ? { userId: asNum }
    : { userName: String(ref) };

  let res;
  try {
    res = await fetch(new URL("/api/ingest/chore-payout", url), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ externalId, ...target, amountCents, description, points }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return { ok: false, error: `network: ${e.name === "TimeoutError" ? "timeout" : e.message}` };
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-json response */ }
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || `HTTP ${res.status}` };
  }
  return { ok: true, txId: data.txId ?? null, idempotent: !!data.idempotent };
}
