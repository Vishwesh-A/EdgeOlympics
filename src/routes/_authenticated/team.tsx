import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileUp, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyTeam, useSession, type Team } from "@/lib/auth";
import { usedSlots, SLOT_LIMIT } from "@/lib/ranking";
import { useTeamSubmissions } from "@/components/eo/MySubmissions";
import { SlotPips, StateBox } from "@/components/eo/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "My team — Edge Olympics" },
      { name: "description", content: "Manage your team and upload models to Edge Olympics." },
      { property: "og:title", content: "My team — Edge Olympics" },
      { property: "og:description", content: "Manage your team and upload models to Edge Olympics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED = ["tflite"];

function TeamPage() {
  const { user } = useSession();
  const team = useMyTeam(user?.id);
  if (!user || team.isLoading) return <Shell><StateBox title="Loading…" /></Shell>;
  if (team.error) return <Shell><StateBox tone="error" title="Couldn't load your team" body={(team.error as Error).message} /></Shell>;
  return <Shell>{team.data ? <TeamHome team={team.data} /> : <TeamSetup />}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:py-12">{children}</main>;
}

function TeamSetup() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: "create_team" | "join_team") => {
    setBusy(true);
    const { error } =
      fn === "create_team"
        ? await supabase.rpc("create_team", { _name: name })
        : await supabase.rpc("join_team", { _code: code });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(fn === "create_team" ? "Team created!" : "You joined the team!");
    qc.invalidateQueries({ queryKey: ["my-team"] });
  };
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Set up your team</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <form className="glass flex flex-col gap-4 rounded-2xl p-6" onSubmit={(e) => { e.preventDefault(); run("create_team"); }}>
          <p className="text-lg font-semibold">Create a team</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tn">Team name</Label>
            <Input id="tn" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          </div>
          <Button disabled={busy}>Create team</Button>
        </form>
        <form className="glass flex flex-col gap-4 rounded-2xl p-6" onSubmit={(e) => { e.preventDefault(); run("join_team"); }}>
          <p className="text-lg font-semibold">Join with a code</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="jc">Join code</Label>
            <Input id="jc" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="num uppercase" maxLength={6} required />
          </div>
          <Button variant="secondary" disabled={busy}>Join team</Button>
        </form>
      </div>
    </>
  );
}

function TeamHome({ team }: { team: Team }) {
  const subs = useTeamSubmissions(team.id);
  const members = useQuery({
    queryKey: ["members", team.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members").select("user_id, profiles(display_name,email)").eq("team_id", team.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });
  const used = usedSlots(subs.data ?? []);
  const deadline = settings.data?.submission_deadline ? new Date(settings.data.submission_deadline) : null;
  const closed = !!deadline && deadline.getTime() < Date.now();

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Your team</p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{team.name}</h1>
      </div>

      <div className="glass flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm text-muted-foreground">Invite teammates with this code</p>
            <p className="num text-2xl font-bold tracking-widest">{team.join_code}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(team.join_code); toast.success("Code copied"); }}>
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <Uploader teamId={team.id} used={used} closed={closed} deadline={deadline} />
      <a href="/edge-olympics-participant-guide.pdf" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline underline-offset-4">Read the event rulebook (PDF)</a>

      <div className="glass rounded-2xl p-6">
        <p className="mb-3 font-semibold">Members</p>
        <ul className="flex flex-col gap-2 text-sm">
          {(members.data ?? []).map((m) => {
            const p = m.profiles as { display_name: string | null; email: string | null } | null;
            return (
              <li key={m.user_id} className="flex justify-between">
                <span>{p?.display_name ?? "Member"}</span>
                <span className="text-muted-foreground">{p?.email}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <Button asChild variant="ghost"><Link to="/">See your submissions on the leaderboard page →</Link></Button>
    </>
  );
}

function Uploader({ teamId, used, closed, deadline }: { teamId: string; used: number; closed: boolean; deadline: Date | null }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const full = used >= SLOT_LIMIT;

  const pick = (f: File | undefined) => {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED.includes(ext)) return void toast.error("Only .tflite files are allowed.");
    if (f.size > MAX_BYTES) return void toast.error("File is larger than 50 MB.");
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    const ext = file.name.split(".").pop()!.toLowerCase();
    const path = `${teamId}/${crypto.randomUUID()}.${ext}`;
    setProgress(30);
    const up = await supabase.storage.from("models").upload(path, file, { contentType: "application/octet-stream" });
    if (up.error) { setProgress(null); return void toast.error(up.error.message); }
    setProgress(80);
    const { error } = await supabase.from("submissions").insert({
      team_id: teamId,
      file_path: path,
      original_filename: file.name,
      model_size_mb: +(file.size / 1024 / 1024).toFixed(3),
    });
    if (error) {
      await supabase.storage.from("models").remove([path]);
      setProgress(null);
      return void toast.error(error.message);
    }
    setProgress(100);
    toast.success("Model submitted!", { description: "It's now being checked." });
    setFile(null);
    setTimeout(() => setProgress(null), 600);
    qc.invalidateQueries({ queryKey: ["team-subs", teamId] });
  };

  return (
    <div className="glass flex flex-col gap-5 rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-semibold">Submission slots</p>
        <SlotPips used={used} />
      </div>
      {deadline && (
        <p className="text-sm text-muted-foreground">
          Deadline: <span className="num text-foreground">{deadline.toLocaleString()}</span>
        </p>
      )}
      {closed ? (
        <Blocked title="Submissions are closed" body="The deadline has passed. Thanks for competing!" />
      ) : full ? (
        <Blocked
          title="All 3 slots are in use"
          body="Nice work! If a run fails, its slot frees up automatically and you can upload again."
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
            className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors hover:border-primary/60 hover:bg-accent/30"
          >
            <FileUp className="h-8 w-8 text-primary" />
            <span className="font-medium">{file ? file.name : "Drop your model here or click to browse"}</span>
            <span className="text-sm text-muted-foreground">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                : ".tflite · [1,128,128,1] grayscale 0–1 · 8 classes · max 50 MB"}
            </span>
          </button>
          <input ref={input} type="file" accept=".tflite" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          {progress != null && <Progress value={progress} />}
          <Button size="lg" disabled={!file || progress != null} onClick={upload}>
            {progress != null ? "Uploading…" : "Submit model"}
          </Button>
        </>
      )}
    </div>
  );
}

function Blocked({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted p-5">
      <Lock className="mt-0.5 h-5 w-5 text-muted-foreground" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
