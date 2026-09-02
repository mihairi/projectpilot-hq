import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APP_ROLES } from "@/lib/roles";

const roleSchema = z.enum(APP_ROLES);

async function assertAdmin(context: { supabase: any; userId: string }) {
  // Verified through the caller's own RLS-scoped role row (never the admin client).
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: administrator rights required.");
}

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(10),
        full_name: z.string().min(1),
        job_title: z.string().optional(),
        department: z.string().optional(),
        roles: z.array(roleSchema).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        job_title: data.job_title ?? null,
        department: data.department ?? null,
        role: data.roles[0],
      },

    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the user.");

    await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      email: data.email,
      full_name: data.full_name,
      job_title: data.job_title ?? null,
      department: data.department ?? null,
      is_active: true,
    });
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        data.roles.map((role) => ({ user_id: created.user!.id, role })),
        { onConflict: "user_id,role" },
      );
    // Drop the default role the signup trigger adds when it was not requested.
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", created.user.id);
    const stale = (existing ?? [])
      .filter((row) => !data.roles.includes(row.role as (typeof data.roles)[number]))
      .map((row) => row.id);
    if (stale.length) await supabaseAdmin.from("user_roles").delete().in("id", stale);



    return { userId: created.user.id };
  });

export const adminSetRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), roles: z.array(roleSchema).min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert(data.roles.map((role) => ({ user_id: data.userId, role })));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Revoking access: ban the account and mark the profile inactive.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ is_active: data.active }).eq("id", data.userId);
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Clears the user's authenticator app enrolment so they are asked to scan a
 * brand new QR code (Microsoft or Google Authenticator) at next sign-in.
 */
export const adminResetTwoFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: factors, error } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId: data.userId,
    });
    if (error) throw new Error(error.message);
    let removed = 0;
    for (const factor of factors?.factors ?? []) {
      await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: data.userId, id: factor.id });
      removed += 1;
    }
    await supabaseAdmin.from("notifications").insert({
      user_id: data.userId,
      title: "Two-factor authentication reset",
      body: "An administrator reset your 2FA. Open Security to scan a new QR code with Microsoft or Google Authenticator.",
      link: "/security",
    });
    return { removed };
  });

export const adminTwoFactorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(error.message);
    return data.users.map((u) => ({
      id: u.id,
      enrolled: (u.factors ?? []).some((f) => f.status === "verified"),
      banned: Boolean((u as unknown as { banned_until?: string }).banned_until),
      last_sign_in_at: u.last_sign_in_at ?? null,
    }));
  });
