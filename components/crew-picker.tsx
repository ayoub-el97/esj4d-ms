"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { POSITION_LABELS, TEAM_LABELS, type Position, type TeamType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CrewOption = { id: string; name: string; position: Position; team_type: TeamType };

/**
 * Équipiers d'un poste (Matin ou Soir) choisis dans la base des employés : ajout, retrait,
 * remplacement, indépendamment de l'autre poste du même camion. Envoyés au formulaire par des
 * champs cachés « crew » (+ « crew_submitted » pour distinguer « aucun équipier » d'un ancien formulaire).
 */
export function CrewPicker({ options, initial, excludeId, disabled, onChange }: { options: CrewOption[]; initial: { id: string; name: string; position?: string }[]; excludeId?: string | null; disabled?: boolean; onChange?: () => void }) {
  const { t } = useT();
  const [selected, setSelected] = useState<{ id: string; name: string; position?: string }[]>(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const list = options.filter((o) => o.id !== excludeId && (!q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase())));
  // Collecte d'abord, puis les autres employés
  list.sort((a, b) => (a.team_type === b.team_type ? a.name.localeCompare(b.name) : a.team_type === "collecte" ? -1 : 1));

  const apply = () => {
    setSelected([...draft].map((id) => selected.find((s) => s.id === id) ?? { id, name: byId.get(id)?.name ?? "—", position: byId.get(id)?.position }));
    setOpen(false);
    onChange?.();
  };
  const remove = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
    onChange?.();
  };
  const shown = selected.filter((s) => s.id !== excludeId);

  return (
    <div className="space-y-2">
      <input type="hidden" name="crew_submitted" value="1" />
      {shown.map((s) => (
        <input key={s.id} type="hidden" name="crew" value={s.id} />
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.length === 0 && <span className="text-sm text-muted-foreground">{t("Aucun équipier pour ce poste.")}</span>}
        {shown.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 ps-2.5 pe-1 text-sm">
            {s.name}
            {s.position && POSITION_LABELS[s.position as Position] && <span className="text-xs text-muted-foreground">({t(POSITION_LABELS[s.position as Position])})</span>}
            {!disabled && (
              <button type="button" className="rounded-full p-0.5 hover:bg-muted" aria-label={t("Retirer {name}", { name: s.name })} onClick={() => remove(s.id)}>
                <X className="size-3.5" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(new Set(shown.map((s) => s.id)));
              setQ("");
              setOpen(true);
            }}
          >
            <UserPlus /> {t("Ajouter des employés")}
          </Button>
        )}
      </div>

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("Équipiers de ce poste")}</DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Rechercher un employé")} className="ps-8" autoFocus />
            </div>
            <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
              {list.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={draft.has(o.id)}
                      onChange={(e) =>
                        setDraft((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(o.id);
                          else n.delete(o.id);
                          return n;
                        })
                      }
                    />
                    <span className="flex-1">{o.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t(POSITION_LABELS[o.position])} · {t(TEAM_LABELS[o.team_type])}
                    </span>
                  </label>
                </li>
              ))}
              {list.length === 0 && <li className="p-3 text-center text-sm text-muted-foreground">{t("Aucun employé trouvé.")}</li>}
            </ul>
            <DialogFooter>
              <span className="me-auto self-center text-xs text-muted-foreground">{t("{count} sélectionné(s)", { count: draft.size })}</span>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("Annuler")}
              </Button>
              <Button type="button" onClick={apply}>
                {t("Valider")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
