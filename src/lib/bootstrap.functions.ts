import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** True only while the instance has no user accounts at all. */
export const bootstrapNeeded = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error(error.message);
  return { needed: data.users.length === 0 };
});

/**
 * One-time first-run setup: creates the very first administrator.
 * Refuses to run as soon as any account exists.
 */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(10),
        full_name: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (listError) throw new Error(listError.message);
    if (existing.users.length > 0) {
      throw new Error("Setup already completed. Ask an administrator for an account.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, role: "admin" },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the account.");

    await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      email: data.email,
      full_name: data.full_name,
      is_active: true,
    });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id);
    await supabaseAdmin
      .from("user_roles")
      .insert([{ user_id: created.user.id, role: "admin" as const }]);

    return { ok: true };
  });
