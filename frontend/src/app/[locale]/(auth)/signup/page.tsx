"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { slugify } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const signup = useAuthStore((s) => s.signup);
  const router = useRouter();

  useEffect(() => {
    if (!slugManual) {
      setSlug(slugify(orgName));
    }
  }, [orgName, slugManual]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup({ name, email, password, orgName, slug });
      window.location.href = `/${locale}/home`;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("signupError")
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
          {t("signupTitle")}
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
            label={t("signupName")}
            type="text"
            placeholder={t("signupNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label={t("signupEmail")}
            type="email"
            placeholder={t("signupEmailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            label={t("signupPassword")}
            type="password"
            placeholder={t("signupPasswordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            description={t("signupPasswordHint")}
          />

          <Input
            label={t("signupOrg")}
            type="text"
            placeholder={t("signupOrgPlaceholder")}
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
          />

          <Input
            label={t("signupSlug")}
            type="text"
            placeholder={t("signupSlugPlaceholder")}
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugManual(true);
            }}
            required
            description={t("signupSlugHint", { slug })}
          />

          <Button
            type="submit"
            isLoading={loading}
            className="w-full"
            size="md"
          >
            {t("signupSubmit")}
          </Button>
        </form>
      </div>

      <p className="text-center text-[13px] text-muted mt-5">
        {t("hasAccount")}{" "}
        <Link
          href={`/${locale}/login`}
          className="text-foreground hover:text-primary transition-colors"
        >
          {t("login")}
        </Link>
      </p>
    </div>
  );
}
