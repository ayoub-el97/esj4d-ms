"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Load = { ticket: string; tonnage: number | null };
type Row = { key: string; ticket: string; tonnage: string };

/** Nombre de vidages et tonnage total : seuls les tonnages > 0 comptent (même règle que la base). */
export function loadTotals(loads: { tonnage: number | string | null }[]) {
  const valid = loads.map((l) => Number(l.tonnage)).filter((n) => Number.isFinite(n) && n > 0);
  return { dumps: valid.length, tonnage: Math.round(valid.reduce((s, n) => s + n, 0) * 100) / 100 };
}

/**
 * Vidages d'une ligne camion : une ligne par vidage (n° de ticket + tonnage), autant que nécessaire.
 * Le nombre de vidages et le tonnage total se calculent automatiquement. Valeur envoyée dans le
 * champ caché « loads » (JSON). Correction manuelle du nombre de vidages : administrateur seulement.
 */
export function LoadsEditor({
  initial,
  canEdit,
  isAdmin,
  initialOverride,
  initialDumps,
}: {
  initial: Load[];
  canEdit: boolean;
  isAdmin: boolean;
  initialOverride: boolean;
  initialDumps: number;
}) {
  const { t } = useT();
  const toRow = (l?: Load): Row => ({ key: crypto.randomUUID(), ticket: l?.ticket ?? "", tonnage: l?.tonnage != null ? String(l.tonnage) : "" });
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial.map(toRow) : [toRow()]));
  const [override, setOverride] = useState(initialOverride);
  const [manualDumps, setManualDumps] = useState(String(initialDumps));
  const totals = loadTotals(rows);
  const value = JSON.stringify(rows.map((r) => ({ ticket: r.ticket.trim(), tonnage: r.tonnage === "" ? null : Number(r.tonnage) })));
  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      <input type="hidden" name="loads" value={value} />
      <div className="flex items-center justify-between">
        <Label>{t("Vidages (ticket et tonnage)")}</Label>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, toRow()])}>
            <Plus /> {t("Ajouter un vidage")}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2">
            <span className="text-center text-sm font-semibold text-muted-foreground">{i + 1}</span>
            <Input aria-label={t("N° ticket {n}", { n: i + 1 })} placeholder={t("N° ticket")} value={r.ticket} disabled={!canEdit} onChange={(e) => update(r.key, { ticket: e.target.value })} />
            <Input
              aria-label={t("Tonnage {n} (t)", { n: i + 1 })}
              placeholder={t("Tonnage (t)")}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={r.tonnage}
              disabled={!canEdit}
              onChange={(e) => update(r.key, { tonnage: e.target.value })}
            />
            {canEdit ? (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Retirer ce vidage")} onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== r.key) : [toRow()]))}>
                <X />
              </Button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">{t("Nombre de vidages (calculé)")}</div>
          <div className="text-lg font-semibold">{override ? `${manualDumps || 0} (${t("manuel")})` : totals.dumps}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("Tonnage total")}</div>
          <div className="text-lg font-semibold">{totals.tonnage.toFixed(2)} t</div>
        </div>
      </div>
      {isAdmin && canEdit ? (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="dumps_override" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5 size-4" />
            <span>
              {t("Corriger manuellement le nombre de vidages (cas exceptionnel)")}
              <span className="block text-xs text-muted-foreground">{t("Réservé à l'administrateur ; la ligne sera signalée « manuel » dans les rapports.")}</span>
            </span>
          </label>
          {override && <Input name="dumps_count" type="number" min="0" value={manualDumps} onChange={(e) => setManualDumps(e.target.value)} aria-label={t("Nombre de vidages")} className="w-32" />}
        </div>
      ) : (
        initialOverride && <input type="hidden" name="dumps_override" value="keep" />
      )}
    </div>
  );
}
