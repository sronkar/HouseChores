import { NextResponse } from "next/server";
import { getNudgeConfig, pendingDigest, nudgeDue, nudgeMessage, markNudged } from "@/lib/domain.js";

// Pull endpoint for an external WhatsApp poller (a Claude routine).
// GET /api/nudge?token=... → { send, message, recipients, count }.
// When it returns send:true it has already marked the nudge as sent, so the
// caller must actually deliver the message.
export const dynamic = "force-dynamic";

export async function GET(req) {
  const cfg = getNudgeConfig();
  const token = new URL(req.url).searchParams.get("token");
  if (!cfg.token || token !== cfg.token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const digest = pendingDigest();
  const due = nudgeDue(digest.count);
  if (due) markNudged(digest.count);
  return NextResponse.json({
    ok: true,
    send: due,
    count: digest.count,
    message: due ? nudgeMessage(digest) : null,
    recipients: cfg.recipients,
  });
}
