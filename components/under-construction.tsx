import { Construction } from "lucide-react";
import { ModuleHeader } from "@/components/module-header";
import { ModuleButtons } from "@/components/module-buttons";

export function UnderConstruction({ title }: { title: string }) {
  return (
    <div>
      <ModuleHeader title={title} />
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        <Construction className="size-10" />
        <p className="font-medium">Module en cours de construction</p>
        <p className="text-sm">Cette page sera disponible dans une prochaine étape.</p>
      </div>
      <ModuleButtons />
    </div>
  );
}
