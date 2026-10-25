export type Metrics = {
  accuracy: number | null;
  latency_ms: number | null;
  peak_ram_mb: number | null;
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

/** Accuracy desc, then latency asc, then peak RAM asc. Negative => a ranks higher. */
export function compareRank(a: Metrics, b: Metrics) {
  const acc = (Number(b.accuracy ?? -big)) - (Number(a.accuracy ?? -big));
  if (acc !== 0 && !Number.isNaN(acc)) return acc;
  const lat = Number(a.latency_ms ?? big) - Number(b.latency_ms ?? big);
  if (lat !== 0 && !Number.isNaN(lat)) return lat;
  const ram = Number(a.peak_ram_mb ?? big) - Number(b.peak_ram_mb ?? big);
  return Number.isNaN(ram) ? 0 : ram;
}

export function pickBest<T extends Metrics & { status: string }>(subs: T[]): T | null {
  const done = subs.filter((s) => s.status === "completed" && s.accuracy != null);
  if (!done.length) return null;
  return [...done].sort(compareRank)[0] ?? null;
}

export function usedSlots(subs: { status: string }[]) {
  return subs.filter((s) => countsTowardLimit(s.status)).length;
}
