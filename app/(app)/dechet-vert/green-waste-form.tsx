"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteGreenWaste, saveGreenWaste } from "@/lib/actions/green-waste";
import type { GreenWasteEntry } from "@/lib/data/green-waste";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

export function GreenWasteForm({ entry, defaultDate, canEdit }: { entry: GreenWasteEntry | null; defaultDate: string; canEdit: boolean }) {
  const [state, action] = useActionState(saveGreenWaste, null);
  const [pending, start] = useTransition();
  return (
    <form action={action}>
      <input type="hidden" name="id" value={entry?.id ?? ""} />
      <Card>
        <CardHeader>
          <CardTitle>{entry ? "Informations" : "Nouvelle intervention"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ActionMessage state={state} />
          <fieldset disabled={!canEdit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="activity_date">Date</Label>
              <Input id="activity_date" name="activity_date" type="date" defaultValue={entry?.activity_date ?? defaultDate} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location">Lieu (facultatif)</Label>
              <Input id="location" name="location" defaultValue={entry?.location ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="comment">Commentaire (facultatif)</Label>
              <Textarea id="comment" name="comment" defaultValue={entry?.comment ?? ""} rows={3} />
            </div>
          </fieldset>
          {canEdit && (
            <div className="flex gap-2">
              <SubmitButton className="flex-1">{entry ? "Enregistrer" : "Créer puis ajouter les photos"}</SubmitButton>
              {entry && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm("Supprimer cette intervention et ses photos ?")) return;
                    start(async () => {
                      const r = await deleteGreenWaste(entry.id);
                      if (r && !r.ok) toast.error(r.error);
                    });
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
