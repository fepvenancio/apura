"use client";

import { useEffect, useState } from "react";
import { useQueryStore } from "@/stores/query-store";
import { api } from "@/lib/api";
import type { UsageInfo } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { QueryInput } from "@/components/query/query-input";
import { ResultPanel } from "@/components/query/result-panel";

export default function QueryPage() {
  const result = useQueryStore((s) => s.result);
  const error = useQueryStore((s) => s.error);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  useEffect(() => {
    api.getUsage().then(setUsage).catch(() => {});
  }, []);

  return (
    <div>
      <Topbar
        title="Consultas"
        queriesUsed={usage?.queriesUsed}
        queriesLimit={usage?.queriesLimit}
      />

      <div className="mx-auto max-w-4xl p-6 space-y-6">
        <QueryInput autoFocus />

        {error && (
          <div className="rounded-xl border border-danger/20 bg-danger/5 px-6 py-4 text-sm text-danger">
            {error}
          </div>
        )}

        {result && <ResultPanel result={result} />}
      </div>
    </div>
  );
}
