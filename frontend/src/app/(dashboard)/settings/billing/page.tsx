"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BillingInfo } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const PLANS = [
  {
    name: "Starter",
    price: "0",
    queries: "50",
    members: "1",
    features: ["50 consultas/mes", "1 utilizador", "Suporte por email"],
  },
  {
    name: "Pro",
    price: "49",
    queries: "500",
    members: "5",
    features: [
      "500 consultas/mes",
      "5 utilizadores",
      "Dashboards ilimitados",
      "Agendamentos",
      "Suporte prioritario",
    ],
  },
  {
    name: "Business",
    price: "149",
    queries: "2000",
    members: "20",
    features: [
      "2.000 consultas/mes",
      "20 utilizadores",
      "Dashboards ilimitados",
      "Agendamentos",
      "API access",
      "Suporte dedicado",
    ],
  },
  {
    name: "Enterprise",
    price: "Personalizado",
    queries: "Ilimitado",
    members: "Ilimitado",
    features: [
      "Consultas ilimitadas",
      "Utilizadores ilimitados",
      "SLA personalizado",
      "On-premise opcional",
      "Gestor de conta",
    ],
  },
];

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getBilling()
      .then(setBilling)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Topbar title="Faturacao" />

      <div className="max-w-5xl p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">A carregar...</p>
          </div>
        ) : (
          <>
            {/* Current plan */}
            {billing && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Plano atual</h3>
                    <Badge variant="primary">{billing.plan}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted">
                        Consultas
                      </p>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-xl font-semibold tabular-nums">
                          {billing.queriesUsed}
                        </span>
                        <span className="text-xs text-muted">
                          / {billing.queriesLimit}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-[#1a1a1a] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.min(
                              (billing.queriesUsed / billing.queriesLimit) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted">
                        Membros
                      </p>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-xl font-semibold tabular-nums">
                          {billing.membersUsed}
                        </span>
                        <span className="text-xs text-muted">
                          / {billing.membersLimit}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-2 text-xs text-muted">
                      <span>
                        Email de faturacao: {billing.billingEmail}
                      </span>
                      <span>
                        Periodo termina: {formatDate(billing.currentPeriodEnd)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Plan comparison */}
            <div>
              <h3 className="text-sm font-semibold mb-4">Planos disponiveis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {PLANS.map((plan) => {
                  const isCurrent =
                    billing?.plan.toLowerCase() === plan.name.toLowerCase();
                  return (
                    <Card
                      key={plan.name}
                      className={
                        isCurrent ? "border-primary" : ""
                      }
                    >
                      <CardContent className="py-5">
                        <div className="mb-4">
                          <h4 className="font-semibold text-foreground">
                            {plan.name}
                          </h4>
                          <div className="mt-1">
                            {plan.price === "Personalizado" ? (
                              <span className="text-lg font-semibold text-foreground">
                                Personalizado
                              </span>
                            ) : (
                              <div className="flex items-baseline gap-0.5">
                                <span className="text-2xl font-semibold text-foreground">
                                  {plan.price}&euro;
                                </span>
                                <span className="text-xs text-muted">/mes</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <ul className="space-y-2 mb-4">
                          {plan.features.map((f) => (
                            <li
                              key={f}
                              className="text-xs text-muted flex items-start gap-2"
                            >
                              <span className="text-primary mt-0.5">&#10003;</span>
                              {f}
                            </li>
                          ))}
                        </ul>

                        {isCurrent ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            disabled
                          >
                            Plano atual
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full"
                          >
                            {plan.price === "Personalizado"
                              ? "Contactar"
                              : "Fazer upgrade"}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
