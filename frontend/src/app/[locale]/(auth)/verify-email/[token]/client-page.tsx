"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { api } from "@/lib/api";

export function VerifyEmailClient() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const params = useParams();
  const token = params.token as string;
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      try {
        await api.verifyEmail(token);
        if (!cancelled) setSuccess(true);
      } catch {
        if (!cancelled) setError(t("verifyEmailError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="mb-10 text-center">
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          apura<span className="text-primary">.</span>
        </div>
        <p className="text-[13px] text-muted mt-1.5">
          {t("verifyEmailTitle")}
        </p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-6">
        {loading && (
          <div className="text-center py-4">
            <p className="text-sm text-muted">
              {t("verifyEmailLoading")}
            </p>
          </div>
        )}

        {success && (
          <div className="text-center py-4">
            <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-[13px] text-success mb-4">
              {t("verifyEmailSuccess")}
            </div>
            <p className="text-sm text-muted">
              {t("verifyEmailSuccessText")}
            </p>
          </div>
        )}

        {error && (
          <div className="text-center py-4">
            <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger mb-4">
              {error}
            </div>
            <p className="text-sm text-muted">
              {t("verifyEmailErrorText")}
            </p>
          </div>
        )}
      </div>

      <p className="text-center text-[13px] text-muted mt-5">
        <Link
          href={`/${locale}/login`}
          className="text-foreground hover:text-primary transition-colors"
        >
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
