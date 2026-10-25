import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EyeOff, Snowflake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LeaderboardTable, Podium, type LbRow } from "@/components/eo/Leaderboard";
import { MySubmissionsPanel } from "@/components/eo/MySubmissions";
import { Ticker, useActivity } from "@/components/eo/Ticker";
import { LiveIndicator, StateBox } from "@/components/eo/bits";
import { useLiveRefresh } from "@/lib/live";
import { useMyTeam, useSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Edge Olympics — Live Leaderboard" },
      { name: "description", content: "Live rankings of edge AI models benchmarked on Raspberry Pi: accuracy, latency and memory." },
      { property: "og:title", content: "Edge Olympics — Live Leaderboard" },
      { property: "og:description", content: "Live rankings of edge AI models benchmarked on Raspberry Pi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function useLeaderboard() {
  const lb = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async (): Promise<LbRow[]> => {
      const { data, error } = await supabase.rpc("get_leaderboard");
      if (error) throw error;
      return (data ?? []) as LbRow[];
    },
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });
  const activity = useActivity();
  const live = useLiveRefresh([{ table: "activity_events" }, { table: "settings" }], () => {
    lb.refetch();
    settings.refetch();
    activity.refetch();
  });
  return { lb, settings, activity, live };
}

function Index() {
  const [tab, setTab] = useState("leaderboard");
  const { user } = useSession();
  const team = useMyTeam(user?.id);
  const { lb, settings, activity, live } = useLeaderboard();
  const rows = lb.data ?? [];
  const myRank = useMemo(() => {
    const i = rows.findIndex((r) => r.team_id === team.data?.id);
    return i >= 0 ? i + 1 : null;
  }, [rows, team.data?.id]);

  const hidden = settings.data && !settings.data.leaderboard_visible;
  const frozen = settings.data?.leaderboard_frozen;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Edge AI benchmark</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-6xl">Edge Olympics</h1>
        </div>
        <LiveIndicator connected={live.connected} lastUpdated={live.lastUpdated} />
      </section>

      <Ticker events={activity.data ?? []} />

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList className="h-12 w-fit rounded-full p-1">
          <TabsTrigger value="leaderboard" className="rounded-full px-5 text-base">Leaderboard</TabsTrigger>
          <TabsTrigger value="mine" className="rounded-full px-5 text-base">My Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="flex flex-col gap-8">
          {frozen && (
            <div className="glass flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
              <Snowflake className="h-4 w-4 text-primary" /> Leaderboard frozen — results after the freeze stay hidden until the reveal.
            </div>
          )}
          {lb.isLoading ? (
            <StateBox title="Loading leaderboard…" />
          ) : lb.error ? (
            <StateBox tone="error" title="Couldn't load the leaderboard" body={(lb.error as Error).message}>
              <Button variant="outline" onClick={() => lb.refetch()}>Try again</Button>
            </StateBox>
          ) : hidden && rows.length === 0 ? (
            <StateBox title="Leaderboard hidden" body="The organizers have hidden the leaderboard for now. Stay tuned!">
              <EyeOff className="mx-auto h-6 w-6 text-muted-foreground" />
            </StateBox>
          ) : rows.length === 0 ? (
            <StateBox title="No results yet" body="The first completed run will appear here live." />
          ) : (
            <>
              <Podium rows={rows} myTeamId={team.data?.id} />
              <LeaderboardTable rows={rows} myTeamId={team.data?.id} />
            </>
          )}
        </TabsContent>

        <TabsContent value="mine">
          {!user ? (
            <StateBox title="Sign in to see your submissions" body="Track your team's runs, slots and best score.">
              <Button asChild><Link to="/auth">Sign in</Link></Button>
            </StateBox>
          ) : team.isLoading ? (
            <StateBox title="Loading your team…" />
          ) : !team.data ? (
            <StateBox title="You're not in a team yet" body="Create a team or join one with a code.">
              <Button asChild><Link to="/team">Set up team</Link></Button>
            </StateBox>
          ) : (
            <MySubmissionsPanel teamId={team.data.id} teamName={team.data.name} rank={myRank} />
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
