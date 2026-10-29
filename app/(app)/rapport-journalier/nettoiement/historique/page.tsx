import { redirect } from "next/navigation";

/** Ancienne adresse : l'historique des rapports journaliers est regroupé par date. */
export default function NettoiementHistoriquePage() {
  redirect("/rapport-journalier/historique");
}
