"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveCompanyProfile, setCompanyLogo } from "@/lib/actions/company";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMessage, SubmitButton } from "@/components/form-feedback";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024;

export type CompanyDetails = { address: string; phone: string; email: string; legal: string; contractStart: string; contractEnd: string; contractRef: string; alertDays: string };

export function CompanyForm({ companyName, agencyName, details, logoUrl, canEdit }: { companyName: string; agencyName: string; details: CompanyDetails; logoUrl: string | null; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(saveCompanyProfile, null);
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadLogo = (file: File) => {
    if (!ALLOWED.includes(file.type)) return toast.error(t("Format non accepté : PNG, JPG, WEBP ou SVG."));
    if (file.size > MAX_BYTES) return toast.error(t("Le logo ne doit pas dépasser 2 Mo."));
    start(async () => {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z]/g, "") || "png";
      const path = `logo/${Date.now()}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type, upsert: true });
      if (error) {
        toast.error(t("Envoi du logo impossible : {message}", { message: error.message }));
        return;
      }
      const r = await setCompanyLogo(path);
      if (r.ok) {
        setPreview(URL.createObjectURL(file));
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const removeLogo = () =>
    start(async () => {
      if (!window.confirm(t("Supprimer le logo ?"))) return;
      const r = await setCompanyLogo(null);
      if (r.ok) {
        setPreview(null);
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{t("Logo de l'entreprise")}</CardTitle>
          <CardDescription>{t("Affiché dans l'en-tête, sur la page de connexion, les feuilles de présence et les PDF.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-muted">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt={t("Logo de l'entreprise")} className="size-full object-contain p-4" />
            ) : (
              <span className="text-sm text-muted-foreground">{t("Aucun logo")}</span>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={pending} onClick={() => fileRef.current?.click()}>
                {pending ? <Loader2 className="animate-spin" /> : <ImagePlus />} {preview ? t("Changer le logo") : t("Ajouter un logo")}
              </Button>
              {preview && (
                <Button type="button" variant="destructive" disabled={pending} onClick={removeLogo} aria-label={t("Supprimer le logo")}>
                  <Trash2 />
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED.join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("PNG, JPG, WEBP ou SVG, 2 Mo maximum. Un logo carré donne le meilleur rendu.")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Identité de l'entreprise")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-3">
            <ActionMessage state={state} />
            <fieldset disabled={!canEdit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="company_name">{t("Nom de la société")}</Label>
                <Input id="company_name" name="company_name" defaultValue={companyName} required placeholder={t("Nom affiché sur l'application et les documents")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="agency_name">{t("Agence / site (facultatif)")}</Label>
                <Input id="agency_name" name="agency_name" defaultValue={agencyName} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="company_address">{t("Adresse")}</Label>
                <Input id="company_address" name="company_address" defaultValue={details.address} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="company_phone">{t("Téléphone")}</Label>
                  <Input id="company_phone" name="company_phone" defaultValue={details.phone} dir="ltr" inputMode="tel" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company_email">{t("E-mail")}</Label>
                  <Input id="company_email" name="company_email" type="email" defaultValue={details.email} dir="ltr" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="company_legal">{t("Identifiants légaux (facultatif)")}</Label>
                <Input id="company_legal" name="company_legal" defaultValue={details.legal} placeholder={t("Ex. ICE …, RC …, IF …")} />
                <p className="text-xs text-muted-foreground">{t("Le nom, le logo et ces coordonnées apparaissent dans les en-têtes des rapports et des PDF. Les modifier ne change aucun enregistrement.")}</p>
              </div>
              <p className="rounded-lg border p-3 text-sm">
                {t("Contrats de la société (dates, rappels, archives, exports) :")}{" "}
                <Link href="/profil/contrats" className="font-medium text-primary underline-offset-2 hover:underline">
                  {t("gérer les contrats")}
                </Link>
              </p>
              <input type="hidden" name="company_contract_start" value={details.contractStart} />
              <input type="hidden" name="company_contract_end" value={details.contractEnd} />
              <input type="hidden" name="company_contract_ref" value={details.contractRef} />
              <input type="hidden" name="contract_alert_days" value={details.alertDays} />
            </fieldset>
            {canEdit && <SubmitButton>{t("Enregistrer")}</SubmitButton>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
