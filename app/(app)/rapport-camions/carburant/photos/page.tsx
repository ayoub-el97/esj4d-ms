import Link from "next/link";
import { Search } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { getEmployees, getTrucks } from "@/lib/data/employees";
import { getFuelPhotoArchive } from "@/lib/data/fuel";
import { formatDateFr, isISODate } from "@/lib/dates";
import { getT, pageTitle } from "@/lib/i18n/server";
import { DRIVER_POSITIONS } from "@/lib/types";
import { ModuleHeader } from "@/components/module-header";
import { PhotoGallery } from "@/components/photo-gallery";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";

export const generateMetadata = pageTitle("Archive photos carburant");

type SP = { from?: string; to?: string; truck?: string; driver?: string };

export default async function FuelPhotosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [, t] = await Promise.all([requireModule("rapport_camions"), getT()]);
  const sp = await searchParams;
  const filters = { from: isISODate(sp.from) ? sp.from : undefined, to: isISODate(sp.to) ? sp.to : undefined, truck: sp.truck || undefined, driver: sp.driver || undefined };
  const [entries, trucks, collecte] = await Promise.all([getFuelPhotoArchive(filters), getTrucks(), getEmployees({ team: "collecte" })]);
  const drivers = collecte.filter((e) => DRIVER_POSITIONS.includes(e.position));
  const count = entries.reduce((s, e) => s + e.photos.length, 0);

  return (
    <div>
      <ModuleHeader title={t("Archive photos carburant")} subtitle={t("{count} photo(s)", { count })} backHref="/rapport-camions/carburant" />

      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="from">{t("Du")}</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t("Au")}</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="truck">{t("Matricule")}</Label>
          <NativeSelect id="truck" name="truck" defaultValue={filters.truck ?? ""}>
            <option value="">{t("Tous")}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.matricule}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="driver">{t("Chauffeur")}</Label>
          <NativeSelect id="driver" name="driver" defaultValue={filters.driver ?? ""}>
            <option value="">{t("Tous")}</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.last_name} {d.first_name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Search /> {t("Filtrer")}
          </Button>
          <LinkButton href="/rapport-camions/carburant/photos" variant="outline">
            {t("Tout")}
          </LinkButton>
        </div>
      </form>

      {entries.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">{t("Aucune photo pour ces critères.")}</p>}
      <div className="space-y-4">
        {entries.map((e) => (
          <section key={e.id} className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <Link href={`/rapport-camions/carburant/${e.id}`} className="font-semibold hover:underline">
                {formatDateFr(e.activity_date)} — <span className="font-mono">{e.truck?.matricule}</span>
              </Link>
              <span className="text-muted-foreground">{e.driver_name || "—"}</span>
              <span className="text-muted-foreground">
                {e.liters.toFixed(2)} L · {e.cost.toFixed(2)} · {e.odometer_km.toFixed(0)} km
              </span>
            </div>
            <PhotoGallery photos={e.photos} />
          </section>
        ))}
      </div>
    </div>
  );
}
