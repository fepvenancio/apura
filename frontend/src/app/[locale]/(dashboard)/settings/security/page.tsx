"use client";

import { UserProfile } from "@clerk/nextjs";
import { Topbar } from "@/components/layout/topbar";
import { useTranslations } from "next-intl";

export default function SecurityPage() {
  const t = useTranslations("security");

  return (
    <div>
      <Topbar title={t("title")} />
      <div className="max-w-3xl p-4 sm:p-6">
        <UserProfile
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-none border border-card-border bg-card",
            },
          }}
        />
      </div>
    </div>
  );
}
