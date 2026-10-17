"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addHoliday, deleteHoliday } from "@/lib/actions/admin";
import { formatDateFr } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function HolidaysUI({ holidays }: { holidays: { date: string; label: string }[] }) {
  const { t } = useT();
  const [state, action] = useActionState(addHoliday, null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>{t("Calendrier ({count})", { count: holidays.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date")}</TableHead>
                <TableHead>{t("Libellé")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t("Aucun jour férié enregistré.")}
                  </TableCell>
                </TableRow>
              )}
              {holidays.map((h) => (
                <TableRow key={h.date}>
                  <TableCell>{formatDateFr(h.date)}</TableCell>
                  <TableCell>{h.label}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await deleteHoliday(h.date);
                          if (r.ok) toast.success(r.message);
                          else toast.error(r.error);
                        })
                      }
                      aria-label={t("Supprimer")}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Ajouter un jour férié")}</CardTitle>
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
    </div>
  );
}
