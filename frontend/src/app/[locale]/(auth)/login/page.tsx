"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { MfaRequiredError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // Check if org requires MFA setup — redirect to security settings
      if (useAuthStore.getState().mfaSetupRequired) {
        window.location.href = `/${locale}/settings/security`;
        return;
      }
      window.location.href = `/${locale}/home`;
    } catch (err) {
      if (err instanceof MfaRequiredError) {
        router.push(`/${locale}/login/mfa`);
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : t("loginError")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-10 text-center">
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          apura<span className="text-primary">.</span>
        </div>
        <p className="text-[13px] text-muted mt-1.5">
          {t("loginTitle")}
        </p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          )}

          <Input
            label={t("loginEmail")}
            type="email"
            placeholder={t("loginEmailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            label={t("loginPassword")}
            type="password"
            placeholder={t("loginPasswordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Button
            type="submit"
            isLoading={loading}
            className="w-full"
            size="md"
          >
            {t("loginSubmit")}
          </Button>
        </form>
      </div>

      <p className="text-center text-[13px] text-muted mt-5">
        {t("noAccount")}{" "}
        <Link
          href={`/${locale}/signup`}
          className="text-foreground hover:text-primary transition-colors"
        >
          {t("createAccount")}
        </Link>
      </p>
    </div>
  );
}
