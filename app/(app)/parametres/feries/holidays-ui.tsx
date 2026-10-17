"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, Clock, RefreshCw, Trash2 } from "lucide-react";
import { addHoliday, confirmHoliday, deleteHoliday, syncMoroccoHolidays } from "@/lib/actions/admin";
import { APP_TIME_ZONE, formatDateFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export type HolidayItem = { date: string; label: string; estimated: boolean; synced: boolean };

/** Heure du Maroc (Africa/Casablanca), mise à jour chaque minute. */
function MoroccoClock() {
  const { t } = useT();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const text = now.toLocaleString("fr-FR", { timeZone: APP_TIME_ZONE, weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="size-4" /> {t("Heure du Maroc : {time}", { time: text })}
    </span>
  );
}

export function HolidaysUI({ holidays, currentYear, missingYears, canEdit }: { holidays: HolidayItem[]; currentYear: number; missingYears: number[]; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(addHoliday, null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const estimatedCount = holidays.filter((h) => h.estimated).length;

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message, { duration: 6000 });
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="size-5 text-primary" /> {t("Calendrier officiel du Maroc")}
          </CardTitle>
          <CardDescription>
            {t("Ajoute les jours fériés nationaux (dates fixes) et religieux (Aïd Al Fitr, Aïd Al Adha, Aïd Al Mawlid, Nouvel An de l'Hégire). Les fêtes religieuses suivent le calendrier lunaire : leur date est estimée et doit être confirmée à l'annonce officielle.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MoroccoClock />
          {missingYears.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{t("Le calendrier {years} n'est pas encore synchronisé.", { years: missingYears.join(", ") })}</p>}
          {estimatedCount > 0 && <p className="text-sm text-orange-700 dark:text-orange-300">{t("{count} date(s) estimée(s) à confirmer.", { count: estimatedCount })}</p>}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {[currentYear, currentYear + 1].map((y) => (
                <Button key={y} type="button" variant={missingYears.includes(y) ? "default" : "outline"} disabled={pending} onClick={() => run(() => syncMoroccoHolidays(y))}>
                  <RefreshCw className={pending ? "animate-spin" : undefined} /> {t("Synchroniser {year}", { year: y })}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Calendrier ({count})", { count: holidays.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Libellé")}</TableHead>
                    <TableHead>{t("Statut")}</TableHead>
                    {canEdit && <TableHead className="text-end">{t("Actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {t("Aucun jour férié enregistré.")}
                      </TableCell>
                    </TableRow>
                  )}
                  {holidays.map((h) => (
                    <TableRow key={h.date}>
                      <TableCell className="whitespace-nowrap font-medium">{formatDateFr(h.date)}</TableCell>
                      <TableCell>{t(h.label)}</TableCell>
                      <TableCell>
                        {h.estimated ? (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-300">{t("Date estimée")}</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{h.synced ? t("Officiel") : t("Saisi")}</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-end">
                          {editing === h.date ? (
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-40" />
                              <Button type="button" size="sm" disabled={pending || !newDate} onClick={() => run(() => confirmHoliday(h.date, newDate), () => setEditing(null))}>
                                {t("Enregistrer")}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                                {t("Annuler")}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              {h.estimated && (
                                <>
                                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => confirmHoliday(h.date))}>
                                    {t("Confirmer")}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditing(h.date);
                                      setNewDate(h.date);
                                    }}
                                  >
                                    {t("Changer la date")}
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending}
                                onClick={() => window.confirm(t("Supprimer ce jour férié ?")) && run(() => deleteHoliday(h.date))}
                                aria-label={t("Supprimer")}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {canEdit && (
          <Card>
            <CardHeader>
              <CardTitle>{t("Ajouter un jour férié")}</CardTitle>
              <CardDescription>{t("Pour un jour exceptionnel décrété par les autorités, ou un férié propre à l'entreprise.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={action} className="space-y-3">
                <ActionMessage state={state} />
                <div className="space-y-1">
                  <Label htmlFor="date">{t("Date")}</Label>
                  <Input id="date" name="date" type="date" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="label">{t("Libellé")}</Label>
                  <Input id="label" name="label" placeholder={t("Ex. Fête du Travail")} required />
                </div>
                <SubmitButton className="w-full">{t("Ajouter")}</SubmitButton>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
