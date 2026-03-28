import { ClerkProvider } from '@clerk/nextjs'
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "apura",
  icons: { icon: "/icon.svg" },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
