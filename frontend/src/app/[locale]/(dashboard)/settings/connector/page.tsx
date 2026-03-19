"use client";

import { useState, useEffect } from "react";
import { useConnectorStore } from "@/stores/connector-store";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Copy, Check, Download } from "lucide-react";

export default function ConnectorPage() {
  const { status, agentApiKey, lastHeartbeat, checkStatus } =
    useConnectorStore();
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const maskedKey = agentApiKey
    ? `${agentApiKey.slice(0, 8)}${"*".repeat(24)}${agentApiKey.slice(-4)}`
    : "—";

  const handleCopyKey = async () => {
    if (!agentApiKey) return;
    await navigator.clipboard.writeText(agentApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <Topbar title="Conector" />

      <div className="max-w-3xl p-6 space-y-6">
        {/* Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Estado da ligação</h3>
              <Badge
                variant={status === "connected" ? "success" : "danger"}
                dot
              >
                {status === "connected" ? "Ligado" : "Desligado"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {lastHeartbeat && (
              <p className="text-sm text-muted">
                Último heartbeat: {formatDate(lastHeartbeat)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* API Key */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">Chave de API do agente</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-[#0d0d0d] border border-card-border px-3 py-2 text-sm font-mono text-foreground">
                {showKey ? agentApiKey || "—" : maskedKey}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? "Ocultar" : "Mostrar"}
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
            <h3 className="text-sm font-semibold">Download do conector</h3>
          </CardHeader>
          <CardContent>
            <Button variant="primary">
              <Download className="h-4 w-4" />
              Descarregar Apura Connector
            </Button>
            <p className="text-xs text-muted mt-2">
              Windows x64 — Compatível com Windows Server 2016+
            </p>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">Instruções de configuração</h3>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4 text-sm text-foreground/80">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  1
                </span>
                <span>
                  Descarregue o <strong>Apura Connector</strong> usando o botão acima.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  2
                </span>
                <span>
                  Instale no <strong>Windows Server</strong> onde o SQL Server está a correr.
                  O instalador cria um serviço Windows automático.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  3
                </span>
                <span>
                  Durante a configuração, introduza a <strong>chave de API</strong>{" "}
                  mostrada acima.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  4
                </span>
                <span>
                  Após instalação, o conector aparecerá como{" "}
                  <strong>&ldquo;Ligado&rdquo;</strong> nesta página.
                </span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
