"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { signIn } from "@/lib/actions/auth";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginForm({ notice }: { notice?: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(signIn, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Connexion")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {notice && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {state && !state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t("Adresse e-mail")}</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("Mot de passe")}</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("Se connecter")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
