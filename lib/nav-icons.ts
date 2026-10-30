// Icône de chaque section (utilisable côté serveur et navigateur).
import { createElement } from "react";
import {
  AlertTriangle,
  BellRing,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileBarChart2,
  MapPin,
  Home,
  Leaf,
  ListTodo,
  Lock,
  Rocket,
  Settings,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const NAV_ICONS: Record<string, LucideIcon> = {
  "/": Home,
  "/pointage": ClipboardCheck,
  "/pointage/mensuel": CalendarRange,
  "/rapport-journalier": ClipboardList,
  "/lieux-de-travail": MapPin,
  "/rapport-mensuel": FileBarChart2,
  "/rapport-camions": Truck,
  "/reparations": Wrench,
  "/achats": ShoppingCart,
  "/conges": CalendarDays,
  "/avertissements": AlertTriangle,
  "/programme": ListTodo,
  "/dechet-vert": Leaf,
  "/rapports-travailleurs": UserRound,
  "/cloture": Lock,
  "/rappels": BellRing,
  "/profil": Building2,
  "/mise-en-route": Rocket,
  "/employes": Users,
  "/parametres": Settings,
};

export const iconFor = (href: string): LucideIcon => NAV_ICONS[href] ?? CalendarCheck2;

/** Icône d'une section, en composant stable (évite de créer un composant pendant le rendu). */
export function NavIcon({ href, className }: { href: string; className?: string }) {
  return createElement(NAV_ICONS[href] ?? CalendarCheck2, { className, "aria-hidden": true });
}
