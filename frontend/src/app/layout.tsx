import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apura \u2014 Relat\u00f3rios inteligentes para Primavera",
  description:
    "Fa\u00e7a perguntas em linguagem natural sobre os seus dados Primavera e obtenha respostas instant\u00e2neas com gr\u00e1ficos e tabelas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
