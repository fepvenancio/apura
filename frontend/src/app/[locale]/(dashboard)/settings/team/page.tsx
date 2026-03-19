"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { TeamMember, Invitation } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Users, Plus, Trash2, X, ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

export default function TeamPage() {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fullLocale = locale === "pt" ? "pt-PT" : locale === "es" ? "es-ES" : "en-US";

  const ROLES = [
    { value: "admin", label: t("roleAdmin") },
    { value: "member", label: t("roleMember") },
    { value: "viewer", label: t("roleViewer") },
  ];

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [togglingMfa, setTogglingMfa] = useState(false);
  const [resettingMfa, setResettingMfa] = useState<string | null>(null);
  const userRole = useAuthStore((s) => s.user?.role);
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";

  useEffect(() => {
    const load = async () => {
      try {
        const [m, i] = await Promise.all([
          api.getTeamMembers(),
          api.getInvitations(),
        ]);
        setMembers(m);
        setInvitations(i);
        try {
          const settings = await api.getOrgSettings();
          setMfaRequired(!!settings.mfa_required);
        } catch {
          // Ignore
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const invitation = await api.sendInvitation({
        email: inviteEmail,
        role: inviteRole,
      });
      setInvitations((prev) => [invitation, ...prev]);
      setInviteEmail("");
      setShowInvite(false);
    } catch {
      // Ignore
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    try {
      await api.updateMemberRole(memberId, role);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, role: role as TeamMember["role"] }
            : m
        )
      );
    } catch {
      // Ignore
    }
  };

  const handleRemoveMember = async (id: string) => {
    try {
      await api.removeMember(id);
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // Ignore
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    try {
      await api.revokeInvitation(id);
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // Ignore
    }
  };

  const handleToggleMfaRequired = async () => {
    setTogglingMfa(true);
    try {
      await api.updateOrgMfaRequired(!mfaRequired);
      setMfaRequired(!mfaRequired);
    } catch {
      // Ignore
    } finally {
      setTogglingMfa(false);
    }
  };

  const handleResetMfa = async (userId: string) => {
    if (!confirm(t("resetMfaConfirm"))) {
      return;
    }
    setResettingMfa(userId);
    try {
      await api.resetUserMfa(userId);
      const m = await api.getTeamMembers();
      setMembers(m);
    } catch {
      // Ignore
    } finally {
      setResettingMfa(null);
    }
  };

  return (
    <div>
      <Topbar title={t("title")} />

      <div className="max-w-4xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {t("memberCount", { count: members.length })}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowInvite(!showInvite)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("invite")}
          </Button>
        </div>

        {showInvite && (
          <Card>
            <CardContent className="py-5">
              <form onSubmit={handleInvite} className="space-y-4">
                <Input
                  label={t("inviteEmail")}
                  type="email"
                  placeholder={t("inviteEmailPlaceholder")}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground/80">
                    {t("inviteRole")}
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={inviting}
                  >
                    {t("inviteSubmit")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowInvite(false)}
                  >
                    {tc("cancel")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* MFA enforcement toggle (admin/owner only) */}
        {isAdminOrOwner && !loading && (
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t("mfaRequired")}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {t("mfaRequiredHint")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleMfaRequired}
                  disabled={togglingMfa}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer ${
                    mfaRequired ? "bg-primary" : "bg-card-border"
                  } ${togglingMfa ? "opacity-50" : ""}`}
                  role="switch"
                  aria-checked={mfaRequired}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      mfaRequired ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">{tc("loading")}</p>
          </div>
        ) : (
          <>
            {/* Members table */}
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold">{t("membersTitle")}</h3>
              </CardHeader>
              {members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted">
                  <Users className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">{t("noMembers")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border">
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("nameColumn")}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("emailColumn")}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("roleColumn")}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("mfaColumn")}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("sinceColumn")}
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("actionsColumn")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border/50">
                      {members.map((member) => (
                        <tr
                          key={member.id}
                          className="hover:bg-[#1a1a1a] transition-colors"
                        >
                          <td className="px-6 py-3 text-foreground">
                            {member.name}
                          </td>
                          <td className="px-6 py-3 text-muted">
                            {member.email}
                          </td>
                          <td className="px-6 py-3">
                            {member.role === "owner" ? (
                              <Badge variant="warning">{t("roleOwner")}</Badge>
                            ) : (
                              <select
                                value={member.role}
                                onChange={(e) =>
                                  handleRoleChange(member.id, e.target.value)
                                }
                                className="rounded-md border border-card-border bg-background px-2 py-1 text-xs text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40"
                              >
                                {ROLES.map((r) => (
                                  <option key={r.value} value={r.value}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            {member.mfa_enabled ? (
                              <ShieldCheck className="h-4 w-4 text-success" />
                            ) : (
                              <ShieldOff className="h-4 w-4 text-muted/40" />
                            )}
                          </td>
                          <td className="px-6 py-3 text-xs text-muted">
                            {formatDate(member.joinedAt, fullLocale)}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isAdminOrOwner &&
                                member.role !== "owner" &&
                                member.mfa_enabled && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleResetMfa(member.id)}
                                    disabled={resettingMfa === member.id}
                                  >
                                    <ShieldOff className="h-3.5 w-3.5 text-warning" />
                                  </Button>
                                )}
                              {member.role !== "owner" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveMember(member.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Pending invitations */}
            {invitations.filter((i) => i.status === "pending").length > 0 && (
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold">{t("pendingInvitations")}</h3>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border">
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("emailColumn")}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("roleColumn")}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("expiresColumn")}
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                          {t("actionsColumn")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border/50">
                      {invitations
                        .filter((i) => i.status === "pending")
                        .map((invitation) => (
                          <tr
                            key={invitation.id}
                            className="hover:bg-[#1a1a1a] transition-colors"
                          >
                            <td className="px-6 py-3 text-foreground">
                              {invitation.email}
                            </td>
                            <td className="px-6 py-3">
                              <Badge variant="muted">{invitation.role}</Badge>
                            </td>
                            <td className="px-6 py-3 text-xs text-muted">
                              {formatDate(invitation.expiresAt, fullLocale)}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleRevokeInvitation(invitation.id)
                                }
                              >
                                <X className="h-3.5 w-3.5 text-danger" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
