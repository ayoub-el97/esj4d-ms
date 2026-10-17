"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { isDayClosed } from "@/lib/data/attendance";
import type { SheetPayload } from "@/lib/attendance-types";
import { ATTENDANCE_STATUSES, type ActionResult } from "@/lib/types";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const optionalTime = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(timeRe, "Heure invalide (HH:MM).").nullable());
const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());

const rowSchema = z.object({
  employee_id: z.string().uuid(),
  shift: z.number().int().min(1).max(3),
  status: z.enum(ATTENDANCE_STATUSES as [string, ...string[]]),
  time_in: optionalTime,
  time_out: optionalTime,
  overtime_hours: z.coerce.number().min(0).max(24),
  observation: z.string().max(500).default(""),
  replacing_employee_id: optionalUuid,
  chauffeur_id: optionalUuid,
  position: z.enum(["chauffeur", "rippeur", "balayeur"]),
  team_type: z.enum(["collecte", "nettoiement"]),
});

const payloadSchema = z.object({
  activity_date: z.string().date("Date invalide."),
  team_type: z.enum(["collecte", "nettoiement"]),
  team_lead: z.string().max(120).default(""),
  rows: z.array(rowSchema).max(500),
});

/** Enregistre une feuille de présence complète (ajouts, modifications, suppressions). */
export async function saveSheet(payload: SheetPayload): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${t(issue.message)} (${issue.path.join(".")})` };
  }
  const { activity_date, team_type, team_lead, rows } = parsed.data;

  if (await isDayClosed(activity_date)) {
    return { ok: false, error: t("Cette journée est clôturée : aucune modification possible.") };
  }

  const keys = new Set(rows.map((r) => `${r.employee_id}:${r.shift}`));
  if (keys.size !== rows.length) return { ok: false, error: t("Un employé apparaît deux fois sur le même service.") };

  const supabase = await createClient();

  // Lignes existantes de cette équipe/date, pour supprimer celles retirées de la feuille
  const { data: existing } = await supabase.from("attendance").select("id, employee_id, shift").eq("activity_date", activity_date).eq("team_type", team_type);
  const toDelete = (existing ?? []).filter((e) => !keys.has(`${e.employee_id}:${e.shift}`)).map((e) => e.id);
  if (toDelete.length) {
    const { error } = await supabase.from("attendance").delete().in("id", toDelete);
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
  }

  if (rows.length) {
    const { error } = await supabase.from("attendance").upsert(
      rows.map((r) => ({ ...r, activity_date, team_type })),
      { onConflict: "activity_date,employee_id,shift" },
    );
    if (error) return { ok: false, error: t(friendlyError(error.message)) };
  }

  const { error: metaError } = await supabase.from("attendance_sheet_meta").upsert({ activity_date, team_type, team_lead }, { onConflict: "activity_date,team_type" });
  if (metaError) return { ok: false, error: t(friendlyError(metaError.message)) };

  revalidatePath("/pointage");
  return { ok: true, message: t("Feuille de présence enregistrée.") };
}

export async function closeDay(date: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("cloture", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!z.string().date().safeParse(date).success) return { ok: false, error: t("Date invalide.") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_day", { p_date: date });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/cloture");
  revalidatePath("/pointage");
  return { ok: true, message: t("Journée clôturée. Les données sont conservées dans l'historique.") };
}

export async function reopenDay(date: string, reason: string): Promise<ActionResult> {
  const t = await getT();
  const auth = await assertModule("cloture", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (auth.user.role !== "admin") return { ok: false, error: t("Seul un administrateur peut rouvrir une journée.") };
  if (!z.string().date().safeParse(date).success) return { ok: false, error: t("Date invalide.") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_day", { p_date: date, p_reason: reason });
  if (error) return { ok: false, error: t(friendlyError(error.message)) };
  revalidatePath("/cloture");
  revalidatePath("/pointage");
  return { ok: true, message: t("Journée rouverte. La justification a été enregistrée dans le journal d'audit.") };
}
