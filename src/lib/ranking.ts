export type Metrics = {
  accuracy: number | null;
  latency_ms: number | null;
  peak_ram_mb: number | null;
};

export type ScoringSettings = {
  weight_accuracy: number;
  weight_latency: number;
  weight_ram: number;
  latency_ref_ms: number;
  ram_ref_mb: number;
};

export const DEFAULT_SCORING: ScoringSettings = {
  weight_accuracy: 0.6,
  weight_latency: 0.25,
  weight_ram: 0.15,
  latency_ref_ms: 100,
  ram_ref_mb: 256,
};

export const SLOT_LIMIT = 3;

export const COUNTED_STATUSES = [
  "pending_prelim",
  "queued_for_edge",
  "running",
  "completed",
  "disqualified",
] as const;

export type SubmissionStatus =
  | "pending_prelim"
  | "queued_for_edge"
  | "running"
  | "completed"
  | "failed_prelim"
  | "failed_runtime"
  | "failed_timeout"
  | "failed_oom"
  | "disqualified";

export function countsTowardLimit(status: string) {
  return (COUNTED_STATUSES as readonly string[]).includes(status);
}

export function isFailed(status: string) {
  return status.startsWith("failed_");
}

const big = Number.POSITIVE_INFINITY;

/** Mirrors get_leaderboard() in the Supabase migration. */
export function scoreModel(metrics: Metrics, settings: ScoringSettings = DEFAULT_SCORING): number | null {
  const { accuracy, latency_ms: latency, peak_ram_mb: ram } = metrics;
  if (accuracy == null || latency == null || ram == null ||
      !Number.isFinite(accuracy) || !Number.isFinite(latency) || !Number.isFinite(ram) ||
      accuracy < 0 || accuracy > 1 || latency <= 0 || ram <= 0) return null;
  const total = settings.weight_accuracy + settings.weight_latency + settings.weight_ram;
  if (total <= 0 || settings.latency_ref_ms <= 0 || settings.ram_ref_mb <= 0) return null;
  return 100 * (
    settings.weight_accuracy * accuracy +
    settings.weight_latency * settings.latency_ref_ms / (settings.latency_ref_ms + latency) +
    settings.weight_ram * settings.ram_ref_mb / (settings.ram_ref_mb + ram)
  ) / total;
}

/** Weighted score desc, then accuracy/latency/RAM as deterministic tie breaks. */
export function compareRank(a: Metrics, b: Metrics, settings: ScoringSettings = DEFAULT_SCORING) {
  const scoreDiff = Number(scoreModel(b, settings) ?? -big) - Number(scoreModel(a, settings) ?? -big);
  if (scoreDiff !== 0 && !Number.isNaN(scoreDiff)) return scoreDiff;
  const acc = (Number(b.accuracy ?? -big)) - (Number(a.accuracy ?? -big));
  if (acc !== 0 && !Number.isNaN(acc)) return acc;
  const lat = Number(a.latency_ms ?? big) - Number(b.latency_ms ?? big);
  if (lat !== 0 && !Number.isNaN(lat)) return lat;
  const ram = Number(a.peak_ram_mb ?? big) - Number(b.peak_ram_mb ?? big);
  return Number.isNaN(ram) ? 0 : ram;
}

export function pickBest<T extends Metrics & { status: string }>(subs: T[], settings: ScoringSettings = DEFAULT_SCORING): T | null {
  const done = subs.filter((s) => s.status === "completed" && scoreModel(s, settings) != null);
  if (!done.length) return null;
  return [...done].sort((a, b) => compareRank(a, b, settings))[0] ?? null;
}

export function usedSlots(subs: { status: string }[]) {
  return subs.filter((s) => countsTowardLimit(s.status)).length;
}
