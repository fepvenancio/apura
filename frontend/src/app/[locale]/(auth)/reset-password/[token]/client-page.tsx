"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ResetPasswordClient() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const params = useParams();
  const token = params.token as string;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("resetPasswordMismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("resetPasswordTooShort"));
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
    } catch {
      setError(t("resetPasswordError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="mb-10 text-center">
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          apura<span className="text-primary">.</span>
        </div>
        <p className="text-[13px] text-muted mt-1.5">
          {t("resetPasswordTitle")}
        </p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-6">
        {success ? (
          <div className="text-center py-4">
            <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-[13px] text-success mb-4">
              {t("resetPasswordSuccess")}
            </div>
            <p className="text-sm text-muted">
              {t("resetPasswordSuccessText")}
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
              {t("resetPasswordText")}
            </p>

            <Input
              label={t("resetPasswordNew")}
              type="password"
              placeholder={t("resetPasswordNewPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              description={t("resetPasswordNewHint")}
            />

            <Input
              label={t("resetPasswordConfirm")}
              type="password"
              placeholder={t("resetPasswordConfirmPlaceholder")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />

            <Button
              type="submit"
              isLoading={loading}
              className="w-full"
              size="md"
            >
              {t("resetPasswordSubmit")}
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
