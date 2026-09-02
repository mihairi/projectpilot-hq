import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Resolves a short username (the part before "@") to the account email.
 * Sign-in is username-only; this is intentionally public like any login page
 * username check and returns only the email needed to authenticate.
 */
export const resolveUsername = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({ username: z.string().min(1).max(200) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const username = (data.username.split("@")[0] ?? "").trim().toLowerCase();
    if (!username) return { email: null as string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("email", `${username.replace(/[%_]/g, "")}@%`)
      .limit(2);
    if (error) throw new Error(error.message);
    const email = rows?.length === 1 ? (rows[0]?.email ?? null) : null;
    return { email };
  });
