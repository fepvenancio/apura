"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As palavras-passe nao coincidem.");
      return;
    }
    if (password.length < 8) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.acceptInvitation(token, { name, password });
      useAuthStore.setState({
        user: result.user,
        org: result.org,
        isAuthenticated: true,
      });
      router.push("/home");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao aceitar convite. O link pode ter expirado."
      );
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
          Aceitar convite
        </p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-6">
        <p className="text-sm text-muted mb-4">
          Foi convidado para uma organizacao. Preencha os dados abaixo
          para criar a sua conta.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          )}

          <Input
            label="Nome"
            type="text"
            placeholder="Joao Silva"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Palavra-passe"
            type="password"
            placeholder="Minimo 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            description="Minimo 8 caracteres"
          />

          <Input
            label="Confirmar palavra-passe"
            type="password"
            placeholder="Repita a palavra-passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />

          <Button
            type="submit"
            isLoading={loading}
            className="w-full"
            size="md"
          >
            Aceitar convite e criar conta
          </Button>
        </form>
      </div>
    </div>
  );
}
