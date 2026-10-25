import { useEffect, useRef, useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { Crown, Feather, Target, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "./bits";
import { usePrefersReducedMotion } from "@/lib/live";

export type LbRow = {
  team_id: string;
  team_name: string;
  accuracy: number | null;
  latency_ms: number | null;
  peak_ram_mb: number | null;
  model_size_mb: number | null;
};

const MEDAL = ["gold", "silver", "bronze"] as const;
const medalText = { gold: "text-gold", silver: "text-silver", bronze: "text-bronze" };
const medalBorder = { gold: "border-gold/60", silver: "border-silver/50", bronze: "border-bronze/60" };
const medalBg = { gold: "bg-gold/15", silver: "bg-silver/10", bronze: "bg-bronze/15" };

function pct(a: number | null) {
  return a == null ? null : Number(a) <= 1 ? Number(a) * 100 : Number(a);
}

export function useBadges(rows: LbRow[]) {
  const minBy = (k: keyof LbRow) =>
    rows.filter((r) => r[k] != null).sort((a, b) => Number(a[k]) - Number(b[k]))[0]?.team_id;
  const maxAcc = rows.filter((r) => r.accuracy != null).sort((a, b) => Number(b.accuracy) - Number(a.accuracy))[0]?.team_id;
  return { sharpshooter: maxAcc, speed: minBy("latency_ms"), feather: minBy("peak_ram_mb") };
}

function Badges({ id, b }: { id: string; b: ReturnType<typeof useBadges> }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {b.sharpshooter === id && <Badge icon={<Target className="h-3.5 w-3.5" />} label="Sharpshooter" />}
      {b.speed === id && <Badge icon={<Zap className="h-3.5 w-3.5" />} label="Speed Demon" />}
      {b.feather === id && <Badge icon={<Feather className="h-3.5 w-3.5" />} label="Featherweight" />}
    </span>
  );
}
function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
      {icon}
      {label}
    </span>
  );
}

export function Podium({ rows, myTeamId }: { rows: LbRow[]; myTeamId?: string }) {
  const top = rows.slice(0, 3);
  if (!top.length) return null;
  const order = [1, 0, 2].filter((i) => top[i]);
  const heights = ["h-40 md:h-52", "h-28 md:h-40", "h-20 md:h-32"];
  return (
    <div className="grid grid-cols-3 items-end gap-3 md:gap-6">
      {order.map((i) => {
        const r = top[i];
        const m = MEDAL[i];
        return (
          <motion.div
            layout
            key={r.team_id}
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {i === 0 && <Crown className="h-8 w-8 text-gold md:h-10 md:w-10" />}
            <p
              className={cn(
                "max-w-full truncate text-center text-base font-semibold md:text-2xl",
                r.team_id === myTeamId && "text-primary",
              )}
            >
              {r.team_name}
            </p>
            <p className={cn("num text-lg md:text-3xl font-bold", medalText[m])}>
              <CountUp value={pct(r.accuracy)} decimals={2} suffix="%" />
            </p>
            <div
              className={cn(
                "flex w-full items-start justify-center rounded-t-2xl border pt-3",
                heights[i],
                medalBorder[m],
                medalBg[m],
                i === 0 && "glow-gold",
              )}
            >
              <span className={cn("num text-3xl font-bold md:text-5xl", medalText[m])}>{i + 1}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function LeaderboardTable({ rows, myTeamId }: { rows: LbRow[]; myTeamId?: string }) {
  const reduced = usePrefersReducedMotion();
  const badges = useBadges(rows);
  const prev = useRef<Map<string, string>>(new Map());
  const [flash, setFlash] = useState<Set<string>>(new Set());

  useEffect(() => {
    const changed = new Set<string>();
    rows.forEach((r, i) => {
      const sig = `${i}|${r.accuracy}|${r.latency_ms}|${r.peak_ram_mb}`;
      const old = prev.current.get(r.team_id);
      if (prev.current.size && old !== sig) changed.add(r.team_id);
      prev.current.set(r.team_id, sig);
    });
    if (changed.size) {
      setFlash(changed);
      const t = setTimeout(() => setFlash(new Set()), 1700);
      return () => clearTimeout(t);
    }
  }, [rows]);

  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[640px] text-left">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b">
            <th className="px-5 py-4 w-20">Rank</th>
            <th className="px-5 py-4">Team</th>
            <th className="px-5 py-4 text-right">Accuracy</th>
            <th className="px-5 py-4 text-right">Latency</th>
            <th className="px-5 py-4 text-right">Peak RAM</th>
            <th className="px-5 py-4 text-right">Model size</th>
          </tr>
        </thead>
        <tbody className="text-base md:text-xl">
          <LayoutGroup>
            {rows.map((r, i) => {
              const m = MEDAL[i];
              return (
                <motion.tr
                  layout={!reduced}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  key={r.team_id}
                  className={cn(
                    "border-b last:border-0",
                    flash.has(r.team_id) && "animate-flash",
                    r.team_id === myTeamId && "bg-accent/40",
                  )}
                >
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "num inline-flex h-9 w-9 items-center justify-center rounded-full border font-bold",
                        m ? `${medalText[m]} ${medalBorder[m]} ${medalBg[m]}` : "border-border text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="font-semibold">
                        {r.team_name}
                        {r.team_id === myTeamId && <span className="ml-2 text-xs text-primary">You</span>}
                      </span>
                      <Badges id={r.team_id} b={badges} />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-semibold">
                    <CountUp value={pct(r.accuracy)} decimals={2} suffix="%" />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <CountUp value={r.latency_ms} decimals={1} suffix=" ms" />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <CountUp value={r.peak_ram_mb} decimals={1} suffix=" MB" />
                  </td>
                  <td className="px-5 py-4 text-right text-muted-foreground">
                    <CountUp value={r.model_size_mb} decimals={2} suffix=" MB" />
                  </td>
                </motion.tr>
              );
            })}
          </LayoutGroup>
        </tbody>
      </table>
    </div>
  );
}
