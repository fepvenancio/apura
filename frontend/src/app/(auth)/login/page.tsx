"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { MfaRequiredError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/home");
    } catch (err) {
      if (err instanceof MfaRequiredError) {
        router.push("/login/mfa");
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Email ou palavra-passe incorretos."
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
          Inicie sessão na sua conta
        </p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            placeholder="nome@empresa.pt"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            label="Palavra-passe"
            type="password"
            placeholder="A sua palavra-passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Button
            type="submit"
            isLoading={loading}
            className="w-full"
            size="md"
          >
            Entrar
          </Button>
        </form>
      </div>

      <p className="text-center text-[13px] text-muted mt-5">
        Não tem conta?{" "}
        <Link
          href="/signup"
          className="text-foreground hover:text-primary transition-colors"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
