import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type ActivityEvent = { id: number; team_name: string; message: string; created_at: string };

export function useActivity() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: async (): Promise<ActivityEvent[]> => {
      const { data, error } = await supabase
        .from("activity_events")
        .select("id,team_name,message,created_at")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function Ticker({ events }: { events: ActivityEvent[] }) {
  if (!events.length) return null;
  const items = [...events, ...events];
  return (
    <div className="glass flex items-center gap-3 overflow-hidden rounded-full px-4 py-2">
      <Activity className="h-4 w-4 shrink-0 text-primary" />
      <div className="relative flex-1 overflow-hidden">
        <div className="animate-ticker flex w-max gap-10 whitespace-nowrap text-sm">
          {items.map((e, i) => (
            <span key={`${e.id}-${i}`} className="text-muted-foreground">
              <span className="font-semibold text-foreground">{e.team_name}</span> {e.message}
              <span className="num ml-2 text-xs opacity-60">
                {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
