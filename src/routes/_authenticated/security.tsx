import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({
    meta: [
      { title: "Security & 2FA | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "Manage your password and authenticator-app two-factor authentication for the Atlas workspace.",
      },
      { property: "og:title", content: "Security & 2FA | Atlas Enterprise Workspace" },
      { property: "og:description", content: "Manage password and authenticator-app 2FA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const factors = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => (await supabase.auth.mfa.listFactors()).data,
  });
  const verified = factors.data?.totp?.find((f) => f.status === "verified");

  async function enroll() {
    setBusy(true);
    for (const f of factors.data?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${Date.now()}`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function verify() {
    if (!factorId) return;
    setBusy(true);
    const { data: ch, error: cerr } = await supabase.auth.mfa.challenge({ factorId });
    if (cerr) {
      setBusy(false);
      return toast.error(cerr.message);
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setQr(null);
    setSecret(null);
    setCode("");
    toast.success("Authenticator app activated");
    qc.invalidateQueries({ queryKey: ["mfa-factors"] });
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      // @ts-expect-error current_password is supported by Lovable Cloud auth
      current_password: currentPassword,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setCurrentPassword("");
    setNewPassword("");
    toast.success("Password updated");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground">
          Manage your password and authenticator-app two-factor authentication.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {verified ? (
              <ShieldCheck className="size-5 text-primary" />
            ) : (
              <ShieldAlert className="size-5 text-destructive" />
            )}
            Two-factor authentication
          </CardTitle>
          <CardDescription>
            {verified
              ? "Your authenticator app is active. Re-enrol only if you changed device."
              : "Scan the QR code with Microsoft Authenticator or Google Authenticator."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!qr && (
            <Button onClick={enroll} disabled={busy} variant={verified ? "outline" : "default"}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {verified ? "Re-enrol a new device" : "Set up authenticator app"}
            </Button>
          )}
          {qr && (
            <div className="space-y-3">
              <div className="surface inline-flex p-4">
                <img src={qr} alt="Two-factor authentication QR code" className="size-48" />
              </div>
              {secret && (
                <p className="break-all text-xs text-muted-foreground">
                  Manual key: <span className="font-mono">{secret}</span>
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  className="max-w-40"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button onClick={verify} disabled={busy}>
                  Activate
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Passwords must be at least 10 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cp">Current password</Label>
              <Input
                id="cp"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="np">New password</Label>
              <Input
                id="np"
                type="password"
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
