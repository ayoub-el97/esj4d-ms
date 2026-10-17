// Vérifie que chaque texte traduisible de l'interface a une traduction anglaise et arabe.
// Usage : node scripts/i18n-check.mjs            -> liste les clés manquantes (code de sortie 1 si manque)
//         node scripts/i18n-check.mjs --keys     -> affiche toutes les clés (JSON)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIRS = ["app", "components", "lib"];
const SKIP = ["components/ui", "lib/i18n/messages"];

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (SKIP.some((s) => rel.startsWith(s))) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

const PATTERNS = [
  /\bt\(\s*"((?:[^"\\]|\\.)+)"/g, // t("…")
  /\b(?:label|description|title|reason|message|error)\s*[:=]\s*"([^"]+)"/g, // props et objets
  /\.(?:min|max|email|date|uuid|regex|positive)\([^"\n]*?"([^"]+)"\)/g, // messages zod
  /return "([^"]+)";/g, // friendlyError & co
  /\[\s*"([^"]+)",\s*[a-z]/g, // ["Libellé", valeur]
];
const LABEL_FILES = ["lib/types.ts", "lib/module-types.ts", "lib/photo-types.ts", "lib/modules.ts", "app/(app)/parametres/audit/page.tsx", "app/(app)/rapport-mensuel/page.tsx"];
const LABEL_PATTERN = /\b\w+:\s*"([^"]+)"/g;
const WEEKDAYS = /"(Dimanche|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dim|Lun|Mar|Mer|Jeu|Ven|Sam)"/g;

const looksLikeText = (s) =>
  /[A-Za-zÀ-ÿ]/.test(s) && !/^[a-z_]+$/.test(s) && !/^\/|^(bg|text|flex|border|grid|size|h-|w-|px|py|ms-|me-)/.test(s) && !/^[a-z-]+\/[a-z]/.test(s) && !s.includes("@/");

// Appels explicites : toujours des textes, même courts (« au », « j », « vous »)
const EXPLICIT = [/\bt\(\s*"((?:[^"\\]|\\.)+)"/g, /\bpageTitle\(\s*"((?:[^"\\]|\\.)+)"/g];

const keys = new Set();
for (const file of DIRS.flatMap((d) => walk(d))) {
  const src = readFileSync(join(ROOT, file), "utf8");
  for (const re of EXPLICIT) for (const m of src.matchAll(re)) keys.add(m[1].replace(/\\"/g, '"'));
  for (const re of PATTERNS) for (const m of src.matchAll(re)) if (looksLikeText(m[1])) keys.add(m[1].replace(/\\"/g, '"'));
  if (LABEL_FILES.includes(file)) {
    for (const m of src.matchAll(LABEL_PATTERN)) if (looksLikeText(m[1]) && /[A-ZÀ-Ý]/.test(m[1][0])) keys.add(m[1]);
    for (const m of src.matchAll(WEEKDAYS)) keys.add(m[1]);
  }
}
// Non-textes connus (identifiants, valeurs techniques)
for (const k of ["Helvetica", "Helvetica-Bold", "image/jpeg", "Africa/Casablanca", "ESJ-4D", "Close System", "%s · ESJ-4D", "activity_date,truck_id"]) keys.delete(k);

if (process.argv.includes("--keys")) {
  console.log(JSON.stringify([...keys].sort(), null, 0));
  process.exit(0);
}

async function load(lang) {
  const src = readFileSync(join(ROOT, `lib/i18n/messages/${lang}.ts`), "utf8");
  const body = src.slice(src.indexOf("= {") + 2, src.lastIndexOf("}") + 1);
  return new Function(`return (${body});`)();
}

let missing = 0;
for (const lang of ["en", "ar"]) {
  const dict = await load(lang);
  const miss = [...keys].filter((k) => !(k in dict)).sort();
  const extra = Object.keys(dict).filter((k) => !keys.has(k));
  const badVars = [...keys].filter((k) => k in dict && JSON.stringify((k.match(/\{\w+\}/g) ?? []).sort()) !== JSON.stringify((dict[k].match(/\{\w+\}/g) ?? []).sort()));
  console.log(`${lang}: ${keys.size} clés, ${miss.length} manquante(s), ${extra.length} inutilisée(s), ${badVars.length} variable(s) incohérente(s)`);
  miss.forEach((k) => console.log(`  MANQUE ${JSON.stringify(k)}`));
  badVars.forEach((k) => console.log(`  VARIABLES ${JSON.stringify(k)} -> ${JSON.stringify(dict[k])}`));
  missing += miss.length + badVars.length;
}
process.exit(missing ? 1 : 0);
