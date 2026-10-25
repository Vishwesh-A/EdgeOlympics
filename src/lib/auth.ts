import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user ?? null, ready };
}

export type Team = { id: string; name: string; join_code: string };

export function useMyTeam(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-team", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Team | null> => {
      const { data: m, error } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      if (!m) return null;
      const { data: t, error: e2 } = await supabase
        .from("teams")
        .select("id,name,join_code")
        .eq("id", m.team_id)
        .single();
      if (e2) throw e2;
      return t;
    },
  });
}

export function useIsOrganizer(userId: string | undefined) {
  return useQuery({
    queryKey: ["is-organizer", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: userId!, _role: "admin" });
      return !!data;
    },
  });
}
