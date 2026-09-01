import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { can, type AppRole } from "@/lib/roles";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading, user: session?.user ?? null };
}

export function useCurrentUser() {
  const { user, loading } = useSession();

  const profileQuery = useQuery({
    queryKey: ["me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
      ]);
      const roles = (roleRows ?? []).map((r) => r.role as AppRole);
      return { profile, roles };
    },
  });

  const roles = profileQuery.data?.roles ?? [];

  return {
    user,
    loading: loading || profileQuery.isLoading,
    profile: profileQuery.data?.profile ?? null,
    roles,
    perms: can(roles),
  };
}
