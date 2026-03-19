"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Warning banner shown when subscriptionStatus is 'past_due'.
 * Rendered conditionally by billing page based on subscription status.
 */
export function PaymentFailedBanner() {
  const t = useTranslations("billing");
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (dismissed) return null;

  async function handleUpdatePayment() {
    setLoading(true);
    try {
      const { url } = await api.createPortalSession();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <p className="text-sm text-amber-400">
            {t("paymentFailed")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleUpdatePayment}
            disabled={loading}
            className="rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? t("redirecting") : t("updatePayment")}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-md p-1 text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
            aria-label={t("updatePayment")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
