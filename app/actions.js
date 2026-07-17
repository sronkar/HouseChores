"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as dom from "@/lib/domain.js";

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
  });
  revalidatePath("/parent/admin");
}
export async function updateKidAction(formData) {
  await requireParent();
  dom.updateKid(Number(formData.get("id")), {
    name: String(formData.get("name") || "").trim() || "Kid",
    emoji: String(formData.get("emoji") || "🙂"),
    color: String(formData.get("color") || "#5b8def"),
  });
  revalidatePath("/parent/admin");
}

// ---------- admin: recurring templates ----------
export async function addTemplateAction(formData) {
  await requireParent();
  dom.addTemplate({
    name: String(formData.get("name") || "").trim() || "Chore",
    emoji: String(formData.get("emoji") || "✅"),
    points: Number(formData.get("points") || 5),
    kidIds: formData.getAll("kidIds").map(Number),
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
  });
  revalidatePath("/parent/admin");
}
export async function deleteTemplateAction(formData) {
  await requireParent();
  dom.deactivateTemplate(Number(formData.get("id")));
  revalidatePath("/parent/admin");
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

// ---------- admin: PIN ----------
export async function setPinAction(formData) {
  await requireParent();
  const pin = String(formData.get("pin") || "").trim();
  if (/^\d{4,8}$/.test(pin)) dom.setSetting("parent_pin", pin);
  revalidatePath("/parent/admin");
}
