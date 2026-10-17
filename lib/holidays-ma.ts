// Jours fériés officiels du Maroc pour une année donnée.
//  * Fêtes nationales : dates fixes.
//  * Fêtes religieuses : calendrier de l'Hégire (lunaire). Les dates sont ESTIMÉES avec le
//    calendrier hégirien tabulaire (« islamic-civil »), qui a donné les dates retenues au Maroc
//    en 2024 et 2025 ; la date officielle dépend de l'observation du croissant et doit être
//    confirmée à l'annonce du ministère des Habous.

export type MoroccoHoliday = { date: string; label: string; sync_key: string; estimated: boolean };

const FIXED: { md: string; key: string; label: string }[] = [
  { md: "01-01", key: "nouvel-an", label: "Nouvel An" },
  { md: "01-11", key: "manifeste", label: "Manifeste de l'Indépendance" },
  { md: "01-14", key: "yennayer", label: "Nouvel An amazigh (Yennayer)" },
  { md: "05-01", key: "travail", label: "Fête du Travail" },
  { md: "07-30", key: "trone", label: "Fête du Trône" },
  { md: "08-14", key: "oued-eddahab", label: "Allégeance Oued Eddahab" },
  { md: "08-20", key: "revolution", label: "Révolution du Roi et du Peuple" },
  { md: "08-21", key: "jeunesse", label: "Fête de la Jeunesse" },
  { md: "11-06", key: "marche-verte", label: "Marche Verte" },
  { md: "11-18", key: "independance", label: "Fête de l'Indépendance" },
];

// [mois hégirien, jour, clé, libellé]
const HIJRI: [number, number, string, string][] = [
  [1, 1, "hegire", "Nouvel An de l'Hégire"],
  [3, 12, "mawlid:1", "Aïd Al Mawlid (1er jour)"],
  [3, 13, "mawlid:2", "Aïd Al Mawlid (2e jour)"],
  [10, 1, "fitr:1", "Aïd Al Fitr (1er jour)"],
  [10, 2, "fitr:2", "Aïd Al Fitr (2e jour)"],
  [12, 10, "adha:1", "Aïd Al Adha (1er jour)"],
  [12, 11, "adha:2", "Aïd Al Adha (2e jour)"],
];

export function moroccoHolidays(year: number): MoroccoHoliday[] {
  const list: MoroccoHoliday[] = FIXED.map((f) => ({ date: `${year}-${f.md}`, label: f.label, sync_key: `${year}:${f.key}`, estimated: false }));

  const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-civil-nu-latn", { timeZone: "UTC", day: "numeric", month: "numeric", year: "numeric" });
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 86400000) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const m = Number(p.month);
    const d = Number(p.day);
    const hijriYear = String(p.year ?? p.relatedYear ?? "").replace(/\D/g, "");
    for (const [hm, hd, key, label] of HIJRI) {
      if (hm === m && hd === d) {
        // Clé avec l'année hégirienne : une année grégorienne peut contenir deux fois la même fête
        list.push({ date: new Date(t).toISOString().slice(0, 10), label, sync_key: `${year}:${key}:${hijriYear}`, estimated: true });
      }
    }
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}
