"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch {
      setError(t("forgotPasswordError"));
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
          {t("forgotPasswordTitle")}
        </p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-6">
        {sent ? (
          <div className="text-center py-4">
            <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-[13px] text-success mb-4">
              {t("forgotPasswordSuccess")}
            </div>
            <p className="text-sm text-muted">
              {t("forgotPasswordSuccessText")}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
                {error}
              </div>
            )}

            <p className="text-sm text-muted">
              {t("forgotPasswordText")}
            </p>

            <Input
              label={t("loginEmail")}
              type="email"
              placeholder={t("loginEmailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Button
              type="submit"
              isLoading={loading}
              className="w-full"
              size="md"
            >
              {t("forgotPasswordSubmit")}
            </Button>
          </form>
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
