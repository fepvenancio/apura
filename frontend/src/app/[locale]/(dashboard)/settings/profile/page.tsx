"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const LANGUAGES = [
  { value: "pt", label: "Portugues" },
  { value: "en", label: "English" },
  { value: "es", label: "Espanol" },
];

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState(user?.name || "");
  const [language, setLanguage] = useState("pt");
  const [saving, setSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      await api.updateProfile({ name, language });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch {
      setProfileError("Erro ao atualizar perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("As palavras-passe nao coincidem.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    setChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(false);
    try {
      await api.changePassword({
        currentPassword,
        newPassword,
      });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch {
      setPasswordError("Erro ao alterar palavra-passe.");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div>
      <Topbar title="Perfil" />

      <div className="max-w-3xl p-6 space-y-6">
        {/* Profile info */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">Informacoes pessoais</h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              {profileError && (
                <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-[13px] text-success">
                  Perfil atualizado com sucesso.
                </div>
              )}

              <Input
                label="Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <Input
                label="Email"
                value={user?.email || ""}
                disabled
                description="O email nao pode ser alterado."
              />

              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-medium text-foreground/80">
                  Idioma
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" variant="primary" size="sm" isLoading={saving}>
                Guardar
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change password */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">Alterar palavra-passe</h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {passwordError && (
                <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-[13px] text-success">
                  Palavra-passe alterada com sucesso.
                </div>
              )}

              <Input
                label="Palavra-passe atual"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />

              <Input
                label="Nova palavra-passe"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                description="Minimo 8 caracteres"
              />

              <Input
                label="Confirmar nova palavra-passe"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />

              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={changingPassword}
              >
                Alterar palavra-passe
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
