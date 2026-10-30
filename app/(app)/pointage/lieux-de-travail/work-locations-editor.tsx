"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { saveWorkLocations } from "@/lib/actions/reports";
import type { CombinedReport } from "@/lib/data/combined-report";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const linkClass = "text-xs font-medium text-primary hover:underline";

/**
 * Corrige les lieux directement dans les rapports d'origine (mêmes enregistrements, sans doublon).
 * Employés, chauffeurs et équipes se corrigent dans leur rapport, ouvert par les liens.
 */
export function WorkLocationsEditor({ date, data, canEdit, children }: { date: string; data: CombinedReport; canEdit: boolean; children: ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [trucks, setTrucks] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const open = () => {
    setAgents(Object.fromEntries((data.cleaning ?? []).map((a) => [a.id, a.location])));
    setTrucks(Object.fromEntries((data.trucks ?? []).flatMap((tr) => (tr.reportId ? [[tr.reportId, tr.locations]] : []))));
    setEditing(true);
  };

  const save = () =>
    start(async () => {
      // Seuls les lieux changés sont écrits : le journal ne garde que les vraies modifications
      const res = await saveWorkLocations(date, {
        agents: (data.cleaning ?? []).filter((a) => agents[a.id] !== a.location).map((a) => ({ id: a.id, location: agents[a.id] })),
        trucks: (data.trucks ?? []).filter((tr) => tr.reportId && trucks[tr.reportId] !== tr.locations).map((tr) => ({ id: tr.reportId as string, sectors: trucks[tr.reportId as string] })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setEditing(false);
      router.refresh();
    });

  if (!editing) {
    return (
      <>
        {canEdit && (
          <div className="no-print mb-3 flex justify-end">
            <Button type="button" variant="outline" onClick={open}>
              <Pencil /> {t("Modifier")}
            </Button>
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <section className="space-y-6 rounded-xl border bg-card p-4 text-sm">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-1">
          <h3 className="text-base font-semibold">{t("Nettoiement")}</h3>
          <Link href={`/rapport-journalier/nettoiement?date=${date}`} className={linkClass}>
            {t("Ajouter ou retirer un employé")}
          </Link>
        </div>
        {!data.cleaning?.length ? (
          <p className="text-muted-foreground">{t("Aucun rapport de nettoiement enregistré pour cette date.")}</p>
        ) : (
          <div className="space-y-2">
            {data.cleaning.map((a) => (
              <div key={a.id} className="grid gap-1 sm:grid-cols-2 sm:items-center sm:gap-4">
                <label htmlFor={`agent-${a.id}`} className="font-medium">
                  {a.name}
                </label>
                <Input id={`agent-${a.id}`} dir="auto" maxLength={200} placeholder={t("Lieu de travail")} value={agents[a.id] ?? ""} onChange={(e) => setAgents({ ...agents, [a.id]: e.target.value })} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-1">
          <h3 className="text-base font-semibold">{t("Collecte")}</h3>
          <Link href={`/rapport-journalier/collecte?date=${date}`} className={linkClass}>
            {t("Ouvrir les rapports de collecte")}
          </Link>
        </div>
        {!data.trucks ? (
          <p className="text-muted-foreground">{t("Aucun rapport de collecte enregistré pour cette date.")}</p>
        ) : (
          <div className="space-y-3">
            {data.trucks.map((tr) => (
              <article key={tr.key} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                  <span>
                    {tr.type} {t("N°")} {tr.number}
                  </span>
                  <Link href={tr.reportId ? `/rapport-journalier/collecte/${tr.reportId}` : `/rapport-camions/historique/${date}`} className={linkClass}>
                    {tr.reportId ? t("Modifier chauffeur et équipe") : t("Modifier dans le rapport camions")}
                  </Link>
                </div>
                {tr.reportId ? (
                  <div className="space-y-1">
                    <label htmlFor={`truck-${tr.reportId}`} className="text-xs text-muted-foreground">
                      {t("Lieux de travail")} — {t("un lieu par ligne")}
                    </label>
                    <Textarea id={`truck-${tr.reportId}`} dir="auto" rows={3} maxLength={1000} value={trucks[tr.reportId] ?? ""} onChange={(e) => setTrucks({ ...trucks, [tr.reportId as string]: e.target.value })} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("Aucun rapport de collecte pour ce camion : pas de lieu enregistré.")}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => setEditing(false)}>
          {t("Annuler")}
        </Button>
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? t("Enregistrement…") : t("Enregistrer")}
        </Button>
      </div>
    </section>
  );
}
