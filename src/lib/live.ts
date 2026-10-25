import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on the given tables and calls `onChange`.
 * Falls back to polling every 10s while the channel is not connected.
 */
export function useLiveRefresh(
  tables: { table: string; filter?: string }[],
  onChange: () => void,
  enabled = true,
) {
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = JSON.stringify(tables);

  const refresh = () => {
    cb.current();
    setLastUpdated(new Date());
  };

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const channel = supabase.channel(`live-${Math.random().toString(36).slice(2)}`);
    for (const t of tables) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: t.table, ...(t.filter ? { filter: t.filter } : {}) },
        () => refresh(),
      );
    }
    channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled || connected) return;
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, enabled]);

  return { connected, lastUpdated, refresh };
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const h = () => setReduced(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return reduced;
}
