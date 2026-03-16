import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "apura — Relatórios inteligentes para Primavera",
  description:
    "Faça perguntas em linguagem natural sobre os seus dados Primavera e obtenha respostas instantâneas com gráficos e tabelas.",
  icons: {
    icon: "/icon.svg",
  },
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
