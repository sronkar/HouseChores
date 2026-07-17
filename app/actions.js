"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as dom from "@/lib/domain.js";
import { postChorePayout } from "@/lib/bank.js";

// ---------- kid loop ----------
export async function doneAction(formData) {
  const taskId = Number(formData.get("taskId"));
  const kidId = Number(formData.get("kidId"));
  dom.markDone(taskId, kidId);
  revalidatePath(`/kid/${kidId}`);
}

// ---------- parent auth ----------
const COOKIE = "hc_parent";
export async function isParent() {
  const c = await cookies();
  return c.get(COOKIE)?.value === "1";
}
async function requireParent() {
  if (!(await isParent())) redirect("/parent");
}
export async function loginAction(formData) {
  const pin = String(formData.get("pin") || "");
  if (dom.checkPin(pin)) {
    const c = await cookies();
    c.set(COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
    redirect("/parent");
  }
  redirect("/parent?e=1");
}
export async function logoutAction() {
  const c = await cookies();
  c.delete(COOKIE);
  redirect("/");
}

// ---------- approvals ----------
export async function approveAction(formData) {
  await requireParent();
  dom.approveTask(Number(formData.get("taskId")));
  revalidatePath("/parent");
}
export async function rejectAction(formData) {
  await requireParent();
  dom.rejectTask(Number(formData.get("taskId")));
  revalidatePath("/parent");
}
export async function approveAllAction() {
  await requireParent();
  dom.approveAll();
  revalidatePath("/parent");
}

// ---------- admin: kids ----------
export async function addKidAction(formData) {
  await requireParent();
  dom.addKid({
    name: String(formData.get("name") || "").trim() || "Kid",
    emoji: String(formData.get("emoji") || "🙂"),
    color: String(formData.get("color") || "#5b8def"),
    toddler: formData.get("toddler") ? 1 : 0,
  });
  revalidatePath("/parent/admin");
}
export async function updateKidAction(formData) {
  await requireParent();
  dom.updateKid(Number(formData.get("id")), {
    name: String(formData.get("name") || "").trim() || "Kid",
    emoji: String(formData.get("emoji") || "🙂"),
    color: String(formData.get("color") || "#5b8def"),
    toddler: formData.get("toddler") ? 1 : 0,
  });
  revalidatePath("/parent/admin");
  revalidatePath("/kid/" + Number(formData.get("id")));
}

// ---------- admin: recurring templates ----------
export async function addTemplateAction(formData) {
  await requireParent();
  dom.addTemplate({
    name: String(formData.get("name") || "").trim() || "Chore",
    emoji: String(formData.get("emoji") || "✅"),
    points: Number(formData.get("points") || 5),
    kidIds: formData.getAll("kidIds").map(Number),
    streakAward: Number(formData.get("streak_award") || 0),
    streakInterval: Number(formData.get("streak_interval") || 10),
    streakStep: Number(formData.get("streak_step") || 1),
  });
  revalidatePath("/parent/admin");
}
export async function updateTemplateAction(formData) {
  await requireParent();
  dom.updateTemplate(Number(formData.get("id")), {
    name: String(formData.get("name") || "").trim() || "Chore",
    emoji: String(formData.get("emoji") || "✅"),
    points: Number(formData.get("points") || 5),
    kidIds: formData.getAll("kidIds").map(Number),
    streakAward: Number(formData.get("streak_award") || 0),
    streakInterval: Number(formData.get("streak_interval") || 10),
    streakStep: Number(formData.get("streak_step") || 1),
  });
  revalidatePath("/parent/admin");
}
export async function deleteTemplateAction(formData) {
  await requireParent();
  dom.deactivateTemplate(Number(formData.get("id")));
  revalidatePath("/parent/admin");
}

// ---------- admin: alternating (rotating) chores ----------
export async function addAltAction(formData) {
  await requireParent();
  dom.addAltChore({
    name: String(formData.get("name") || "").trim() || "Chore",
    emoji: String(formData.get("emoji") || "🔁"),
    points: Number(formData.get("points") || 5),
    kidIds: formData.getAll("kidIds").map(Number),
    cadence: String(formData.get("cadence") || "daily"),
  });
  revalidatePath("/parent/admin");
}
export async function updateAltAction(formData) {
  await requireParent();
  dom.updateAltChore(Number(formData.get("id")), {
    name: String(formData.get("name") || "").trim() || "Chore",
    emoji: String(formData.get("emoji") || "🔁"),
    points: Number(formData.get("points") || 5),
    kidIds: formData.getAll("kidIds").map(Number),
    cadence: String(formData.get("cadence") || "daily"),
  });
  revalidatePath("/parent/admin");
}
export async function deleteAltAction(formData) {
  await requireParent();
  dom.deactivateAltChore(Number(formData.get("id")));
  revalidatePath("/parent/admin");
}

// ---------- clone ----------
export async function cloneTemplateAction(formData) {
  await requireParent();
  dom.cloneTemplate(Number(formData.get("id")));
  revalidatePath("/parent/admin");
}
export async function cloneAltAction(formData) {
  await requireParent();
  dom.cloneAltChore(Number(formData.get("id")));
  revalidatePath("/parent/admin");
}
export async function cloneBoardAction(formData) {
  await requireParent();
  dom.cloneBoardTask(Number(formData.get("id")));
  revalidatePath("/parent/admin");
  revalidatePath("/parent");
}

// ---------- admin: board ----------
export async function addBoardAction(formData) {
  await requireParent();
  dom.addBoardChore({
    name: String(formData.get("name") || "").trim() || "Task",
    emoji: String(formData.get("emoji") || "📌"),
    points: Number(formData.get("points") || 5),
  });
  revalidatePath("/parent/admin");
  revalidatePath("/parent");
}
export async function deleteTaskAction(formData) {
  await requireParent();
  dom.deleteTask(Number(formData.get("id")));
  revalidatePath("/parent/admin");
  revalidatePath("/parent");
}

// ---------- admin: excused days ----------
export async function addExcusedAction(formData) {
  await requireParent();
  const kidRaw = String(formData.get("kidId") || "");
  dom.addExcused({
    kidId: kidRaw === "" ? null : Number(kidRaw),
    start: String(formData.get("start")),
    end: String(formData.get("end") || formData.get("start")),
    reason: String(formData.get("reason") || ""),
  });
  revalidatePath("/parent/admin");
}
export async function deleteExcusedAction(formData) {
  await requireParent();
  dom.deleteExcused(Number(formData.get("id")));
  revalidatePath("/parent/admin");
}

// ---------- AbaBank: config, mapping, cash-out ----------
async function pushConversion(conv) {
  const cfg = dom.getBankConfig();
  const kid = dom.getKid(conv.kid_id);
  const r = await postChorePayout({
    url: cfg.url,
    token: cfg.token,
    externalId: conv.external_id,
    ref: kid.ababank_ref,
    amountCents: conv.amount_cents,
    description: `Chore points: ${conv.points} pts (${kid.name})`,
    points: conv.points,
  });
  dom.updateConversionResult(conv.id, {
    status: r.ok ? "sent" : "failed",
    ababankTxId: r.ok ? r.txId : null,
    error: r.ok ? null : r.error,
  });
  return r;
}

export async function saveBankConfigAction(formData) {
  await requireParent();
  dom.setBankConfig({
    url: String(formData.get("url") || ""),
    token: String(formData.get("token") || ""),
    pointsPerDollar: Number(formData.get("points_per_dollar") || 100),
    currency: String(formData.get("currency") || "USD"),
  });
  revalidatePath("/parent/bank");
}
export async function setKidRefAction(formData) {
  await requireParent();
  dom.setKidAbabankRef(Number(formData.get("kidId")), String(formData.get("ref") || ""));
  revalidatePath("/parent/bank");
}
export async function cashOutAction(formData) {
  await requireParent();
  const kidId = Number(formData.get("kidId"));
  const r = dom.cashOut(kidId);
  if (r.ok) await pushConversion(r.conversion);
  revalidatePath("/parent/bank");
}
export async function retryConversionAction(formData) {
  await requireParent();
  const conv = dom.getConversion(Number(formData.get("id")));
  if (conv && conv.status !== "sent") await pushConversion(conv);
  revalidatePath("/parent/bank");
}

// ---------- admin: PIN ----------
export async function setPinAction(formData) {
  await requireParent();
  const pin = String(formData.get("pin") || "").trim();
  if (/^\d{4,8}$/.test(pin)) dom.setSetting("parent_pin", pin);
  revalidatePath("/parent/admin");
}
