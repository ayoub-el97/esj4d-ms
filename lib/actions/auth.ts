"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import type { ActionResult } from "@/lib/types";

const loginSchema = z.object({
  email: z.string().trim().email("Adresse e-mail invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: t(parsed.error.issues[0]?.message ?? "Saisie invalide.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, error: t("Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe.") };
  }
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
