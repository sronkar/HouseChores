// Simple ntfy.sh push (same mechanism AbaBank uses). Server-side only.
export async function pushNtfy(topic, title, message) {
  if (!topic || !message) return { ok: false, error: "no topic/message" };
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: { Title: title || "HouseChores", Tags: "broom" },
      body: message,
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
