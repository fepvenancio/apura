"use client";

import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";

type SetupStep = "idle" | "qr" | "backup" | "done";

export default function SecurityPage() {
  const t = useTranslations("security");
  const tc = useTranslations("common");
  // MFA status
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Setup flow
  const [setupStep, setSetupStep] = useState<SetupStep>("idle");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  // Disable flow
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disabling, setDisabling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkStatus = async () => {
      try {
        await api.setupMfa();
        if (!cancelled) setMfaEnabled(false);
      } catch (err) {
        if (!cancelled) {
          if (
            err instanceof ApiError &&
            typeof err.body === "string" &&
            err.body.includes("MFA_ALREADY_ENABLED")
          ) {
            setMfaEnabled(true);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    checkStatus();
    return () => { cancelled = true; };
  }, []);

  const handleStartSetup = async () => {
    setError(null);
    try {
      const result = await api.setupMfa();
      setQrCodeDataUrl(result.qrCodeDataUrl);
      setSecret(result.secret);
      setSetupStep("qr");
    } catch (err) {
      if (err instanceof Error && err.message.includes("MFA_ALREADY_ENABLED")) {
        setMfaEnabled(true);
      } else {
        setError(
          err instanceof Error ? err.message : t("mfaSetupError")
        );
      }
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmCode.trim()) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await api.confirmMfa(confirmCode.trim());
      setBackupCodes(result.backupCodes);
      setSetupStep("backup");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("mfaVerifyError")
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleCopyCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  const handleAcknowledge = () => {
    setMfaEnabled(true);
    setSetupStep("done");
    setConfirmCode("");
    setQrCodeDataUrl("");
    setSecret("");
    setBackupCodes([]);
    setCodesAcknowledged(false);
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableCode.trim()) return;
    setDisabling(true);
    setError(null);
    try {
      await api.disableMfa(disableCode.trim());
      setMfaEnabled(false);
      setShowDisable(false);
      setDisableCode("");
      setSetupStep("idle");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("mfaDisableError")
      );
    } finally {
      setDisabling(false);
    }
  };

  return (
    <div>
      <Topbar title={t("title")} />

      <div className="max-w-3xl p-4 sm:p-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">
                  {t("mfaTitle")}
                </h3>
              </div>
              {mfaEnabled && (
                <Badge variant="success" dot>
                  {t("mfaActive")}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger mb-4">
                {error}
              </div>
            )}

            {/* MFA not enabled -- setup flow */}
            {!mfaEnabled && setupStep === "idle" && (
              <div className="space-y-4">
                <p className="text-sm text-muted">
                  {t("mfaDescription")}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartSetup}
                >
                  {t("mfaEnable")}
                </Button>
              </div>
            )}

            {/* Step 1: QR code display */}
            {setupStep === "qr" && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm text-muted">
                    {t("mfaQrText")}
                  </p>

                  <div className="flex justify-center py-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrCodeDataUrl}
                      alt={t("mfaQrAlt")}
                      className="rounded-lg border border-card-border bg-white p-2"
                      width={200}
                      height={200}
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted">
                      {t("mfaManualText")}
                    </p>
                    <code className="block rounded-md bg-background border border-card-border px-3 py-2 text-sm font-mono text-foreground break-all select-all">
                      {secret}
                    </code>
                  </div>
                </div>

                <form onSubmit={handleConfirm} className="space-y-4">
                  <Input
                    label={t("mfaVerificationCode")}
                    type="text"
                    placeholder={t("mfaVerificationPlaceholder")}
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    required
                    autoFocus
                    maxLength={6}
                    autoComplete="one-time-code"
                    description={t("mfaVerificationHint")}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={confirming}
                    >
                      {tc("confirm")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSetupStep("idle");
                        setQrCodeDataUrl("");
                        setSecret("");
                        setConfirmCode("");
                        setError(null);
                      }}
                    >
                      {tc("cancel")}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Step 2: Backup codes display */}
            {setupStep === "backup" && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">
                    {t("backupCodesTitle")}
                  </h4>
                  <div className="rounded-md bg-warning/10 border border-warning/20 px-3 py-2.5 text-[13px] text-warning">
                    {t("backupCodesWarning")}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {backupCodes.map((code, i) => (
                      <div
                        key={i}
                        className="rounded-md bg-background border border-card-border px-3 py-2 text-sm font-mono text-foreground text-center"
                      >
                        {code}
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyCodes}
                    className="gap-1.5"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        {tc("copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        {t("backupCodesCopy")}
                      </>
                    )}
                  </Button>
                </div>

                <div className="space-y-3 border-t border-card-border pt-4">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={codesAcknowledged}
                      onChange={(e) => setCodesAcknowledged(e.target.checked)}
                      className="mt-0.5 rounded border-card-border"
                    />
                    <span className="text-sm text-muted">
                      {t("backupCodesAcknowledge")}
                    </span>
                  </label>

                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!codesAcknowledged}
                    onClick={handleAcknowledge}
                  >
                    {t("backupCodesComplete")}
                  </Button>
                </div>
              </div>
            )}

            {/* MFA enabled -- management */}
            {mfaEnabled && setupStep !== "backup" && (
              <div className="space-y-4">
                <p className="text-sm text-muted">
                  {t("mfaActiveText")}
                </p>

                {!showDisable ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowDisable(true)}
                  >
                    {t("mfaDisable")}
                  </Button>
                ) : (
                  <form onSubmit={handleDisable} className="space-y-4">
                    <Input
                      label={t("mfaDisableCode")}
                      type="text"
                      placeholder={t("mfaDisableCodePlaceholder")}
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value)}
                      required
                      autoFocus
                      maxLength={6}
                      autoComplete="one-time-code"
                      description={t("mfaDisableCodeHint")}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="submit"
                        variant="danger"
                        size="sm"
                        isLoading={disabling}
                      >
                        {t("mfaDisableSubmit")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setShowDisable(false);
                          setDisableCode("");
                          setError(null);
                        }}
                      >
                        {tc("cancel")}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
