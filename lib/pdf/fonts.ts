import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Police arabe des PDF (IBM Plex Sans Arabic, licence SIL OFL — lib/pdf/fonts/OFL.txt).
// Le texte français reste en Helvetica ; les caractères arabes saisis par les utilisateurs
// (lieux, commentaires, descriptions…) utilisent cette police de secours : lettres liées,
// sens de lecture droite → gauche, texte mixte français / arabe.
const dir = path.join(process.cwd(), "lib", "pdf", "fonts");
Font.register({ family: "PlexArabic", src: path.join(dir, "IBMPlexSansArabic-Regular.ttf") });
Font.register({ family: "PlexArabicBold", src: path.join(dir, "IBMPlexSansArabic-Bold.ttf") });

/** Police normale : Helvetica, puis arabe pour les caractères arabes. */
export const FONT = ["Helvetica", "PlexArabic"];
/** Police grasse : Helvetica-Bold, puis arabe gras. */
export const FONT_BOLD = ["Helvetica-Bold", "PlexArabicBold"];

/** Texte dont la première lettre est arabe : aligné à droite. */
export function isRtlText(v: unknown): boolean {
  return typeof v === "string" && /^[^A-Za-zÀ-ÖØ-öø-ÿ؀-ۿݐ-ݿ]*[؀-ۿݐ-ݿ]/.test(v);
}
