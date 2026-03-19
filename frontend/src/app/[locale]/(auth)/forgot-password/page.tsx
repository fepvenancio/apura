"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch {
      setError("Erro ao enviar email de recuperacao.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-10 text-center">
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          apura<span className="text-primary">.</span>
        </div>
        <p className="text-[13px] text-muted mt-1.5">
          Recuperar palavra-passe
        </p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-6">
        {sent ? (
          <div className="text-center py-4">
            <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-[13px] text-success mb-4">
              Email de recuperacao enviado com sucesso.
            </div>
            <p className="text-sm text-muted">
              Verifique a sua caixa de entrada e siga as instrucoes
              para redefinir a sua palavra-passe.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
                {error}
              </div>
            )}

            <p className="text-sm text-muted">
              Introduza o seu email e enviaremos um link para redefinir
              a sua palavra-passe.
            </p>

            <Input
              label="Email"
              type="email"
              placeholder="nome@empresa.pt"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Button
              type="submit"
              isLoading={loading}
              className="w-full"
              size="md"
            >
              Enviar email de recuperacao
            </Button>
          </form>
        )}
      </div>

      <p className="text-center text-[13px] text-muted mt-5">
        <Link
          href="/login"
          className="text-foreground hover:text-primary transition-colors"
        >
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
