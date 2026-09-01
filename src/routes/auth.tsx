import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { bootstrapAdmin, bootstrapNeeded } from "@/lib/bootstrap.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "Secure sign in with username, password and authenticator-app two-factor verification for the Atlas project and knowledge workspace.",
      },
      { property: "og:title", content: "Sign in | Atlas Enterprise Workspace" },
      {
        property: "og:description",
        content: "Secure sign in with password and authenticator-app 2FA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Step = "credentials" | "enroll" | "challenge" | "setup";

function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void routeAfterLogin();
        return;
      }
      void bootstrapNeeded()
        .then((r) => {
          if (r.needed) setStep("setup");
        })
        .catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createFirstAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await bootstrapAdmin({ data: { email, password, full_name: fullName } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      toast.success("Administrator account created");
      await routeAfterLogin();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }


  async function routeAfterLogin() {
    // Two-factor is mandatory: anyone without a verified authenticator enrols now.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === "verified");
    if (!verified) {
      await startEnrolment();
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === aal?.nextLevel) {
      navigate({ to: "/portal", replace: true });
      return;
    }
    const { data: ch } = await supabase.auth.mfa.challenge({ factorId: verified.id });
    setFactorId(verified.id);
    setChallengeId(ch?.id ?? null);
    setStep("challenge");
  }


  async function startEnrolment() {
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${Date.now()}`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStep("enroll");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await routeAfterLogin();
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    let cid = challengeId;
    if (!cid) {
      const { data: ch, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error) {
        setBusy(false);
        toast.error(error.message);
        return;
      }
      cid = ch.id;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: cid!,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      setChallengeId(null);
      return;
    }
    toast.success("Two-factor verification complete");
    navigate({ to: "/portal", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            AX
          </div>
          <span className="font-semibold">Atlas Enterprise Workspace</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-semibold leading-tight">
            Projects, tasks and knowledge in one governed workspace.
          </h1>
          <p className="text-sm text-sidebar-foreground/70">
            Role-based access for requesters, analysts, developers, testers and managers. Global
            priority governance, full estimate-versus-actual tracking and cross-project
            dependencies.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          Protected by password and authenticator-app two-factor authentication.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {step === "setup" && (
            <form onSubmit={createFirstAdmin} className="space-y-4">
              <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <UserPlus className="size-5 text-primary" /> First-run setup
                </h2>
                <p className="text-sm text-muted-foreground">
                  No accounts exist yet. Create the first administrator; every other account is
                  provisioned from User administration.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-name">Full name</Label>
                <Input
                  id="setup-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-email">Work email</Label>
                <Input
                  id="setup-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-password">Password (min. 10 characters)</Label>
                <Input
                  id="setup-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create administrator
              </Button>
            </form>
          )}


          {step === "credentials" && (
            <form onSubmit={signIn} className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Sign in</h2>
                <p className="text-sm text-muted-foreground">
                  Use the corporate account issued by your administrator.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Username (email)</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />}
                Continue
              </Button>
              <p className="text-xs text-muted-foreground">
                Accounts are provisioned by administrators. Lost your password or authenticator?
                Contact your administrator for a reset.
              </p>
            </form>
          )}

          {step === "enroll" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <ShieldCheck className="size-5 text-primary" /> Set up two-factor
                </h2>
                <p className="text-sm text-muted-foreground">
                  Scan this QR code with Microsoft Authenticator or Google Authenticator, then enter
                  the 6-digit code.
                </p>
              </div>
              {qr && (
                <div className="surface flex justify-center p-4">
                  <img src={qr} alt="Two-factor authentication QR code" className="size-48" />
                </div>
              )}
              {secret && (
                <p className="break-all text-center text-xs text-muted-foreground">
                  Manual key: <span className="font-mono">{secret}</span>
                </p>
              )}
              <form onSubmit={verifyCode} className="space-y-3">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  required
                />
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Activate 2FA
                </Button>
              </form>
            </div>
          )}

          {step === "challenge" && (
            <form onSubmit={verifyCode} className="space-y-4">
              <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <ShieldCheck className="size-5 text-primary" /> Two-factor verification
                </h2>
                <p className="text-sm text-muted-foreground">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Verify and sign in
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
