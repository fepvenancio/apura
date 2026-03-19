"use client";

import { useState, useEffect } from "react";
import { useConnectorStore } from "@/stores/connector-store";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Copy, Check, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

export default function ConnectorPage() {
  const t = useTranslations("connector");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fullLocale = locale === "pt" ? "pt-PT" : locale === "es" ? "es-ES" : "en-US";
  const { status, agentApiKey, lastHeartbeat, checkStatus } =
    useConnectorStore();
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const maskedKey = agentApiKey
    ? `${agentApiKey.slice(0, 8)}${"*".repeat(24)}${agentApiKey.slice(-4)}`
    : "\u2014";

  const handleCopyKey = async () => {
    if (!agentApiKey) return;
    await navigator.clipboard.writeText(agentApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <Topbar title={t("title")} />

      <div className="max-w-3xl p-6 space-y-6">
        {/* Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("statusTitle")}</h3>
              <Badge
                variant={status === "connected" ? "success" : "danger"}
                dot
              >
                {status === "connected" ? t("statusConnected") : t("statusDisconnected")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {lastHeartbeat && (
              <p className="text-sm text-muted">
                {t("lastHeartbeat", { date: formatDate(lastHeartbeat, fullLocale) })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* API Key */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t("apiKeyTitle")}</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-[#0d0d0d] border border-card-border px-3 py-2 text-sm font-mono text-foreground">
                {showKey ? agentApiKey || "\u2014" : maskedKey}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? tc("hide") : tc("show")}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCopyKey}>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Download */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t("download")}</h3>
          </CardHeader>
          <CardContent>
            <Button variant="primary">
              <Download className="h-4 w-4" />
              {t("downloadButton")}
            </Button>
            <p className="text-xs text-muted mt-2">
              {t("downloadHint")}
            </p>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t("instructions")}</h3>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4 text-sm text-foreground/80">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  1
                </span>
                <span>{t("step1")}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  2
                </span>
                <span>{t("step2")}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  3
                </span>
                <span>{t("step3")}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  4
                </span>
                <span>{t("step4")}</span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
