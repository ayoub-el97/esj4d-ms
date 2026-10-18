"use server";

import { revalidatePath } from "next/cache";
import { assertModule, friendlyError } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { getLiveGrid, getPeriodStartDay } from "@/lib/data/attendance-grid";
import { formatDateFr, isMonth, todayISO } from "@/lib/dates";
import { attendancePeriod } from "@/lib/attendance-grid";
import type { ActionResult } from "@/lib/types";

/**
 * Finalise la période : la grille actuelle (employés, codes, totaux) est figée dans une version.
 * Une période déjà finalisée n'est jamais écrasée : une nouvelle version est créée, avec motif obligatoire.
 */
export async function finalizePeriod(month: string, reason = ""): Promise<ActionResult<{ revision: number }>> {
  const t = await getT();
  const auth = await assertModule("pointage", "edit");
  if ("error" in auth) return { ok: false, error: t(auth.error) };
  if (!isMonth(month)) return { ok: false, error: t("Saisie invalide.") };
  const startDay = await getPeriodStartDay();
  const { to } = attendancePeriod(month, startDay);
  if (to > todayISO()) return { ok: false, error: t("La période n'est pas terminée (fin le {date}) : elle ne peut pas encore être finalisée.", { date: formatDateFr(to) }) };

  const supabase = await createClient();
  const { data: last } = await supabase.from("attendance_period_snapshots").select("revision").eq("period_month", month).order("revision", { ascending: false }).limit(1).maybeSingle();
  const revision = (last?.revision ?? 0) + 1;
  if (revision > 1 && reason.trim().length < 5) return { ok: false, error: t("Indiquez le motif de la mise à jour (5 caractères minimum).") };

  const grid = await getLiveGrid(month, startDay);
  const { error } = await supabase.from("attendance_period_snapshots").insert({
    period_month: month,
    revision,
    period_start: grid.from,
    period_end: grid.to,
    data: grid,
    reason: reason.trim().slice(0, 500),
    created_by: auth.user.id,
  });
  if (error) return { ok: false, error: error.message.includes("duplicate") ? t("Une autre version vient d'être enregistrée : actualisez la page.") : t(friendlyError(error.message)) };
  revalidatePath("/pointage/mensuel");
  return {
    ok: true,
    data: { revision },
    message: revision === 1 ? t("Période finalisée : la grille est conservée dans l'historique.") : t("Version {n} enregistrée ; les versions précédentes restent consultables.", { n: revision }),
  };
}
