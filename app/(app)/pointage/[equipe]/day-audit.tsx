import { formatDateTimeFr } from "@/lib/dates";
import type { DayAuditEntry } from "@/lib/data/attendance";
import type { TFunction } from "@/lib/i18n/config";
import { ATTENDANCE_STATUS_LABELS, POSITION_LABELS, type AttendanceStatus, type Position } from "@/lib/types";

const FIELDS: [string, string][] = [
  ["status", "Statut"],
  ["time_in", "Heure d'entrée"],
  ["time_out", "Heure de sortie"],
  ["overtime_manual", "HS manuelles"],
  ["observation", "Observation"],
  ["position", "Fonction du jour"],
  ["team_type", "Équipe"],
];

function show(t: TFunction, key: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (key === "status") return t(ATTENDANCE_STATUS_LABELS[v as AttendanceStatus] ?? String(v));
  if (key === "position") return t(POSITION_LABELS[v as Position] ?? String(v));
  if (key === "time_in" || key === "time_out") return String(v).slice(0, 5);
  return String(v);
}

/** Journal des modifications de la feuille : qui, quand, valeurs avant / après. */
export function DayAuditCard({ t, entries, names }: { t: TFunction; entries: DayAuditEntry[]; names: Map<string, string> }) {
  if (!entries.length) return null;
  return (
    <details className="mt-6 rounded-xl border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-semibold">{t("Journal des modifications de la feuille ({count})", { count: entries.length })}</summary>
      <ol className="mt-3 space-y-2">
        {entries.map((e, i) => {
          const changes =
            e.action === "UPDATE"
              ? FIELDS.filter(([k]) => JSON.stringify(e.old_data?.[k] ?? null) !== JSON.stringify(e.new_data?.[k] ?? null)).map(([k, l]) => `${t(l)} : ${show(t, k, e.old_data?.[k])} → ${show(t, k, e.new_data?.[k])}`)
              : [];
          if (e.action === "UPDATE" && !changes.length) return null;
          const who = e.employee_id ? (names.get(e.employee_id) ?? "—") : "—";
          return (
            <li key={i} className="border-s-2 border-primary/30 ps-2">
              <div>
                <span className="font-medium">{who}</span> —{" "}
                {e.action === "INSERT" ? t("pointage créé ({status})", { status: show(t, "status", e.new_data?.status) }) : e.action === "DELETE" ? t("ligne retirée de la feuille") : changes.join(" · ")}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDateTimeFr(e.at)} · {e.user_email ?? t("système")}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
