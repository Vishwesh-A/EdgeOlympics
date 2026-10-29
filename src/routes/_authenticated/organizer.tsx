import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Cpu, RotateCcw, Ban, XCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsOrganizer, useSession } from "@/lib/auth";
import { useLiveRefresh } from "@/lib/live";
import { LiveIndicator, StateBox } from "@/components/eo/bits";
import { STATUS_LABEL } from "@/components/eo/StatusStepper";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/organizer")({
  head: () => ({
    meta: [
      { title: "Organizer dashboard — Edge Olympics" },
      { name: "description", content: "Manage submissions, Pi health and leaderboard settings." },
      { property: "og:title", content: "Organizer dashboard — Edge Olympics" },
      { property: "og:description", content: "Manage submissions, Pi health and leaderboard settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrganizerPage,
});

type Row = {
  id: string; status: string; pi_id: string | null; file_path: string | null; file_deleted: boolean;
  original_filename: string | null; error_log: string | null; last_heartbeat: string | null;
  accuracy: number | null; latency_ms: number | null; peak_ram_mb: number | null; created_at: string;
  teams: { name: string } | null;
};

function OrganizerPage() {
  const { user } = useSession();
  const org = useIsOrganizer(user?.id);
  if (org.isLoading || !user) return <Wrap><StateBox title="Checking access…" /></Wrap>;
  if (!org.data) return <Wrap><StateBox tone="error" title="Organizers only" body="Your account doesn't have the organizer role." /></Wrap>;
  return <Dashboard />;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">{children}</main>;
}

function Dashboard() {
  const [status, setStatus] = useState("all");
  const [pi, setPi] = useState("all");
  const subs = useQuery({
    queryKey: ["admin-subs"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("submissions")
        .select("id,status,pi_id,file_path,file_deleted,original_filename,error_log,last_heartbeat,accuracy,latency_ms,peak_ram_mb,created_at,teams(name)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });
  const workers = useQuery({
    queryKey: ["pi-workers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pi_workers").select("pi_id,last_seen").order("pi_id");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10_000,
  });
  const live = useLiveRefresh([{ table: "submissions" }, { table: "settings" }], () => {
    subs.refetch();
    settings.refetch();
  });

  const rows = subs.data ?? [];
  const pis = useMemo(() => {
    return (workers.data ?? []).map((worker) => [
      worker.pi_id,
      { last: worker.last_seen, job: rows.find((r) => r.pi_id === worker.pi_id && r.status === "running") ?? null },
    ] as const);
  }, [rows, workers.data]);
  const filtered = rows.filter((r) => (status === "all" || r.status === status) && (pi === "all" || r.pi_id === pi));

  const act = async (id: string, action: string) => {
    const { error } = await supabase.rpc("admin_submission_action", { _id: id, _action: action });
    if (error) toast.error(error.message);
    else toast.success("Done");
  };
  const delFile = async (r: Row) => {
    if (!r.file_path || !confirm("Delete this model file permanently?")) return;
    const { error } = await supabase.storage.from("models").remove([r.file_path]);
    if (error) { toast.error(error.message); return; }
    await act(r.id, "file_deleted");
  };
  const updateSettings = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from("settings").update(patch as never).eq("id", 1);
    if (error) toast.error(error.message);
    else settings.refetch();
  };

  const s = settings.data;
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Organizer dashboard</h1>
        <LiveIndicator connected={live.connected} lastUpdated={live.lastUpdated} />
      </div>

      {s && (
        <section className="glass grid gap-6 rounded-2xl p-6 md:grid-cols-3">
          <Toggle label="Leaderboard visible" checked={s.leaderboard_visible} onChange={(v) => updateSettings({ leaderboard_visible: v })} />
          <Toggle label="Freeze leaderboard" hint={s.frozen_at ? `Frozen at ${new Date(s.frozen_at).toLocaleTimeString()}` : undefined} checked={s.leaderboard_frozen} onChange={(v) => updateSettings({ leaderboard_frozen: v })} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="dl">Submission deadline</Label>
            <Input
              id="dl"
              type="datetime-local"
              defaultValue={s.submission_deadline ? toLocalInput(s.submission_deadline) : ""}
              onBlur={(e) => updateSettings({ submission_deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 md:col-span-3">
            {(["weight_accuracy", "weight_latency", "weight_ram"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-2">
                <Label htmlFor={k}>{k.replace("weight_", "Weight: ")}</Label>
                <Input id={k} type="number" step="0.05" defaultValue={s[k]} onBlur={(e) => updateSettings({ [k]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-3">
            {([
              ["latency_ref_ms", "Latency reference (ms)"],
              ["ram_ref_mb", "RAM reference (MB)"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-2">
                <Label htmlFor={key}>{label}</Label>
                <Input id={key} type="number" min={0.001} step="0.01" defaultValue={s[key]} onBlur={(e) => updateSettings({ [key]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-semibold">Pi health</h2>
        {pis.length === 0 ? (
          <StateBox title="No Pis have reported yet" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pis.map(([id, p]) => {
              const age = p.last ? (Date.now() - new Date(p.last).getTime()) / 1000 : Infinity;
              const ok = age < 60;
              return (
                <div key={id} className="glass rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold"><Cpu className="h-4 w-4 text-primary" />{id}</span>
                    <span className={cn("h-2.5 w-2.5 rounded-full", ok ? "bg-success" : "bg-destructive")} />
                  </div>
                  <p className="num mt-3 text-xs text-muted-foreground">
                    Heartbeat: {p.last ? `${Math.round(age)}s ago` : "never"}
                  </p>
                  <p className="mt-1 truncate text-sm">
                    {p.job ? `Running: ${p.job.teams?.name ?? ""}` : <span className="text-muted-foreground">Idle</span>}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-xl font-semibold">Submissions <span className="num text-muted-foreground">({filtered.length})</span></h2>
          <select className="h-9 rounded-lg border bg-card px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.keys(STATUS_LABEL).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
          </select>
          <select className="h-9 rounded-lg border bg-card px-3 text-sm" value={pi} onChange={(e) => setPi(e.target.value)}>
            <option value="all">All Pis</option>
            {pis.map(([id]) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        {subs.isLoading ? (
          <StateBox title="Loading submissions…" />
        ) : subs.error ? (
          <StateBox tone="error" title="Couldn't load submissions" body={(subs.error as Error).message} />
        ) : filtered.length === 0 ? (
          <StateBox title="No submissions match" />
        ) : (
          <div className="glass overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3">Team</th><th className="px-4 py-3">File</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Pi</th><th className="px-4 py-3 text-right">Acc</th><th className="px-4 py-3 text-right">Lat</th>
                  <th className="px-4 py-3">Created</th><th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 font-medium">{r.teams?.name}</td>
                    <td className="px-4 py-3">
                      <span className={cn(r.file_deleted && "line-through text-muted-foreground")}>{r.original_filename}</span>
                      {r.error_log && <p className="num mt-1 max-w-xs truncate text-xs text-destructive" title={r.error_log}>{r.error_log}</p>}
                    </td>
                    <td className="px-4 py-3">{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="num px-4 py-3">{r.pi_id ?? "—"}</td>
                    <td className="num px-4 py-3 text-right">{r.accuracy ?? "—"}</td>
                    <td className="num px-4 py-3 text-right">{r.latency_ms ?? "—"}</td>
                    <td className="num px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Requeue" onClick={() => act(r.id, "requeue")}><RotateCcw className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Disqualify" onClick={() => confirm("Disqualify this submission?") && act(r.id, "disqualify")}><Ban className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Mark failed" onClick={() => act(r.id, "mark_failed")}><XCircle className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Delete file" disabled={r.file_deleted || !r.file_path} onClick={() => delFile(r)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string | undefined; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-4">
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
