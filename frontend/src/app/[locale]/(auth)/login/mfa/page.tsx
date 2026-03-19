"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function MfaVerifyPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const pendingMfaToken = useAuthStore((s) => s.pendingMfaToken);
  const verifyMfa = useAuthStore((s) => s.verifyMfa);
  const clearMfaPending = useAuthStore((s) => s.clearMfaPending);
  const router = useRouter();

  useEffect(() => {
    if (!pendingMfaToken) {
      router.push(`/${locale}/login`);
    }
  }, [pendingMfaToken, router, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || locked) return;
    setError(null);
    setLoading(true);
    try {
      await verifyMfa(code.trim());
      router.push(`/${locale}/home`);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body;
        if (typeof body === "string" && body.includes("MFA_LOCKED")) {
          setLocked(true);
          setError(t("mfaLocked"));
          return;
        }
      }
      setError(
        err instanceof Error
          ? err.message
          : t("mfaInvalid")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    clearMfaPending();
    router.push(`/${locale}/login`);
  };

  if (!pendingMfaToken) return null;

  return (
    <div>
      <div className="mb-10 text-center">
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          apura<span className="text-primary">.</span>
        </div>
        <p className="text-[13px] text-muted mt-1.5">
          {t("mfaTitle")}
        </p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-6">
        <p className="text-sm text-muted mb-4">
          {t("mfaText")}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          )}

          <Input
            label={t("mfaCode")}
            type="text"
            placeholder={t("mfaCodePlaceholder")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            maxLength={9}
            autoComplete="one-time-code"
            disabled={locked}
          />

          {locked ? (
            <Button
              type="button"
              className="w-full"
              size="md"
              onClick={handleBackToLogin}
            >
              {t("backToLogin")}
            </Button>
          ) : (
            <Button
              type="submit"
              isLoading={loading}
              className="w-full"
              size="md"
            >
              {t("mfaVerify")}
            </Button>
          )}
        </form>
      </div>

      <div className="mt-5 space-y-2 text-center">
        <p className="text-[13px] text-muted">
          {t("mfaLostAccess")}
        </p>
        <button
          onClick={handleBackToLogin}
          className="text-[13px] text-foreground hover:text-primary transition-colors"
        >
          {t("backToLogin")}
        </button>
      </div>
    </div>
  );
}
