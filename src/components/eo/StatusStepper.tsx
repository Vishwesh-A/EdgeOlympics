import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFailed } from "@/lib/ranking";

const ORDER = ["pending_prelim", "queued_for_edge", "running", "completed"];

export const STATUS_LABEL: Record<string, string> = {
  pending_prelim: "Checking",
  queued_for_edge: "Queued",
  running: "Running",
  completed: "Completed",
  failed_prelim: "Failed checks",
  failed_runtime: "Runtime error",
  failed_timeout: "Timed out",
  failed_oom: "Out of memory",
  disqualified: "Disqualified",
};

/** Uploaded -> Checked -> Queued -> Running on Pi-X -> Done */
export function StatusStepper({ status, piId }: { status: string; piId: string | null }) {
  const failed = isFailed(status) || status === "disqualified";
  const failIdx =
    status === "failed_prelim" ? 1 : status === "disqualified" ? 4 : failed ? 3 : -1;
  // step index currently active (0 Uploaded always done)
  const idx = failed ? failIdx : status === "completed" ? 5 : ORDER.indexOf(status) + 1;
  const steps = ["Uploaded", "Checked", "Queued", `Running${piId ? ` on ${piId}` : ""}`, "Done"];

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((label, i) => {
        const done = i < idx;
        const active = i === idx && !failed && status !== "completed";
        const bad = failed && i === failIdx;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] num",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary animate-pulse-ring",
                bad && "border-destructive bg-destructive text-destructive-foreground",
                !done && !active && !bad && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : bad ? <X className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-xs",
                done || active ? "text-foreground" : "text-muted-foreground",
                bad && "text-destructive",
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-4 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
