import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPhotosFor } from "@/lib/data/photos";
import type { Contract } from "@/lib/contract-types";
import type { PhotoItem } from "@/lib/photo-types";

export type ContractSummary = Record<string, number | string | null> & { from: string; to: string };

export async function getContracts(): Promise<Contract[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("company_contracts").select("*").order("start_date", { ascending: false });
  return (data ?? []) as Contract[];
}

export async function getContract(id: string): Promise<(Contract & { photos: PhotoItem[] }) | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("company_contracts").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const photos = await getPhotosFor("company_contract", [id]);
  return { ...(data as Contract), photos: photos.get(id) ?? [] };
}

/** Totaux et nombres d'enregistrements de la période du contrat (lecture avec les droits de l'utilisateur). */
export async function getContractSummary(id: string): Promise<ContractSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("contract_report_summary", { p_id: id });
  if (error) return null;
  return data as ContractSummary | null;
}

/** Suppression définitive : enregistrements concernés et éventuel blocage (administrateur). */
export async function getContractDeletionInfo(id: string): Promise<{ blocker: string | null; items: { category: string; items: number }[] }> {
  const supabase = await createClient();
  const [{ data: blocker }, { data: items }] = await Promise.all([
    supabase.rpc("contract_deletion_blocker", { p_id: id }),
    supabase.rpc("contract_deletion_preview", { p_id: id }),
  ]);
  return { blocker: (blocker as string | null) ?? null, items: ((items ?? []) as { category: string; items: number }[]).map((x) => ({ ...x, items: Number(x.items) })) };
}

/** Contrat en cours (actif) dont l'échéance est la plus proche — tableau de bord. */
export async function getCurrentContract(): Promise<Contract | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("company_contracts").select("*").eq("status", "actif").order("end_date").limit(1).maybeSingle();
  return (data as Contract | null) ?? null;
}
