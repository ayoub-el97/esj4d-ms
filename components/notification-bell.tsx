"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { ReminderWithStatus } from "@/lib/data/reminders";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ruleLabel, statusLabel } from "@/components/reminders-panel";

const SHOWN_KEY = "esj-reminders-notified";

/**
 * Cloche de l'en-tête : nombre de rappels en alerte et liste rapide.
 * Si l'utilisateur l'a autorisé, une notification du navigateur est affichée
 * une fois par jour et par rappel, à l'ouverture de l'application.
 */
export function NotificationBell({ alerts, today }: { alerts: ReminderWithStatus[]; today: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  // Lu au premier rendu côté navigateur ; n'influence que le menu (fermé à l'hydratation)
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const ref = useRef<HTMLDivElement>(null);

  // Notifications du navigateur (une fois par jour et par rappel)
  useEffect(() => {
    if (permission !== "granted" || alerts.length === 0) return;
    let shown: Record<string, string> = {};
    try {
      shown = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "{}");
    } catch {
      shown = {};
    }
    for (const r of alerts) {
      if (shown[r.id] === today) continue;
      try {
        new Notification(r.title, { body: `${ruleLabel(t, r)} — ${statusLabel(t, r)}`, tag: `rappel-${r.id}` });
      } catch {
        // certains navigateurs mobiles n'autorisent les notifications que via un service worker
      }
      shown[r.id] = today;
    }
    try {
      localStorage.setItem(SHOWN_KEY, JSON.stringify(shown));
    } catch {
      // stockage indisponible (navigation privée) : sans conséquence
    }
  }, [permission, alerts, today, t]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const count = alerts.length;
  const Icon = count ? BellRing : Bell;

  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Rappels et alertes ({count})", { count })} title={t("Rappels et alertes")} onClick={() => setOpen((o) => !o)}>
        <Icon className={cn(count && "text-orange-600")} />
        {count > 0 && <span className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">{count}</span>}
      </Button>
      {open && (
        <div className="absolute end-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="mb-2 text-sm font-semibold">{t("Rappels et alertes")}</div>
          {count === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Aucune alerte pour le moment.")}</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {alerts.map((r) => {
                const state = r.status.state;
                return (
                  <li key={r.id} className={cn("rounded-lg border-s-4 bg-muted/50 p-2 text-sm", state === "overdue" ? "border-s-red-500" : state === "today" ? "border-s-orange-500" : "border-s-amber-400")}>
                    <div className="font-medium">
                      {r.title}
                      {r.priority === "urgent" && <span className="ms-1 rounded bg-red-600 px-1 text-[10px] font-semibold text-white">{t("Urgente")}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{statusLabel(t, r)}</div>
                  </li>
                );
              })}
            </ul>
          )}
          {permission === "default" && (
            <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => Notification.requestPermission().then(setPermission)}>
              {t("Activer les notifications du navigateur")}
            </Button>
          )}
          <Link href="/rappels" className="mt-3 block text-center text-sm text-primary hover:underline" onClick={() => setOpen(false)}>
            {t("Gérer les rappels")}
          </Link>
        </div>
      )}
    </div>
  );
}
