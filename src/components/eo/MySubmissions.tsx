import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { compareRank, isFailed, pickBest, usedSlots } from "@/lib/ranking";
import { useLiveRefresh, usePrefersReducedMotion } from "@/lib/live";
import { CountUp, SlotPips, StateBox } from "./bits";
import { StatusStepper, STATUS_LABEL } from "./StatusStepper";
import { Button } from "@/components/ui/button";

export type Submission = {
  id: string;
  team_id: string;
  status: string;
  error_log: string | null;
  pi_id: string | null;
  accuracy: number | null;
  latency_ms: number | null;
  peak_ram_mb: number | null;
  model_size_mb: number | null;
  original_filename: string | null;
  created_at: string;
  completed_at: string | null;
};

export function useTeamSubmissions(teamId: string | undefined) {
  const q = useQuery({
    queryKey: ["team-subs", teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<Submission[]> => {
      const { data, error } = await supabase
        .from("submissions")
        .select(
          "id,team_id,status,error_log,pi_id,accuracy,latency_ms,peak_ram_mb,model_size_mb,original_filename,created_at,completed_at",
        )
        .eq("team_id", teamId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Submission[];
    },
  });
  const live = useLiveRefresh(
    [{ table: "submissions", filter: `team_id=eq.${teamId}` }],
    () => q.refetch(),
    !!teamId,
  );
  return { ...q, live };
}

export function fireConfetti(reduced: boolean) {
  if (reduced) return;
  confetti({ particleCount: 140, spread: 80, origin: { y: 0.3 } });
}

/** Watches team best + rank and celebrates improvements. */
export function useCelebrations(subs: Submission[] | undefined, rank: number | null) {
  const reduced = usePrefersReducedMotion();
  const prevBest = useRef<string | null | undefined>(undefined);
  const prevRank = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (!subs) return;
    const best = pickBest(subs);
    const id = best?.id ?? null;
    if (prevBest.current !== undefined && id && id !== prevBest.current) {
      toast.success("New personal best!", { description: "Your team set a new best score." });
      fireConfetti(reduced);
    }
    prevBest.current = id;
  }, [subs, reduced]);

  useEffect(() => {
    if (rank == null) return;
    if (prevRank.current != null && rank < prevRank.current) {
      toast.success(rank === 1 ? "You're #1!" : "Rank up!", { description: `Your team is now #${rank}.` });
      if (rank === 1) fireConfetti(reduced);
    }
    prevRank.current = rank;
  }, [rank, reduced]);
}

function pct(a: number | null) {
  return a == null ? null : Number(a) <= 1 ? Number(a) * 100 : Number(a);
}

export function MySubmissionsPanel({
  teamId,
  teamName,
  rank,
}: {
  teamId: string;
  teamName: string;
  rank: number | null;
}) {
  const { data, isLoading, error } = useTeamSubmissions(teamId);
  useCelebrations(data, rank);

  if (isLoading) return <StateBox title="Loading your submissions…" />;
  if (error) return <StateBox tone="error" title="Couldn't load submissions" body={(error as Error).message} />;
  const subs = data ?? [];
  const best = pickBest(subs);
  const used = usedSlots(subs);

  return (
    <div className="flex flex-col gap-6">
      <div className="glass flex flex-col gap-4 rounded-2xl p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Team</p>
          <p className="text-2xl font-semibold">{teamName}</p>
          {rank && <p className="mt-1 text-sm text-muted-foreground">Currently ranked <span className="num text-foreground">#{rank}</span></p>}
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <SlotPips used={used} />
          <Button asChild variant="default" size="sm">
            <Link to="/team">Upload a model</Link>
          </Button>
        </div>
      </div>

      {subs.length === 0 ? (
        <StateBox title="No submissions yet" body="Upload your first .tflite or .onnx model to get on the board." />
      ) : (
        <ul className="flex flex-col gap-4">
          {[...subs].sort((a, b) => (a.id === best?.id ? -1 : b.id === best?.id ? 1 : 0)).map((s) => {
            const isBest = s.id === best?.id;
            const failed = isFailed(s.status);
            return (
              <li
                key={s.id}
                className={cn(
                  "glass relative rounded-2xl p-5 transition-all",
                  isBest && "border-gold glow-gold",
                  failed && "opacity-55",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {isBest && <Trophy className="h-6 w-6 text-gold" />}
                    <div>
                      <p className="font-semibold">
                        {s.original_filename ?? "Model"}
                        {isBest && (
                          <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-primary-foreground">
                            Best
                          </span>
                        )}
                      </p>
                      <p className="num text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      failed || s.status === "disqualified" ? "border-destructive/50 text-destructive" : "border-border",
                      s.status === "completed" && "border-success/50 text-success",
                    )}
                  >
                    {STATUS_LABEL[s.status] ?? s.status}
                    {failed && " · not counted"}
                  </span>
                </div>
                <div className="mt-4">
                  <StatusStepper status={s.status} piId={s.pi_id} />
                </div>
                {s.status === "completed" && (
                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="Accuracy"><CountUp value={pct(s.accuracy)} decimals={2} suffix="%" /></Metric>
                    <Metric label="Latency"><CountUp value={s.latency_ms} decimals={1} suffix=" ms" /></Metric>
                    <Metric label="Peak RAM"><CountUp value={s.peak_ram_mb} decimals={1} suffix=" MB" /></Metric>
                    <Metric label="Model size"><CountUp value={s.model_size_mb} decimals={2} suffix=" MB" /></Metric>
                  </dl>
                )}
                {s.error_log && (failed || s.status === "disqualified") && (
                  <pre className="num mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                    {s.error_log}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}

export { compareRank };
