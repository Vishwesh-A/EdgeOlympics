import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/live";
import { SLOT_LIMIT } from "@/lib/ranking";

export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  className,
}: {
  value: number | null | undefined;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null) return;
    const target = Number(value);
    if (reduced) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(begin + (target - begin) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  if (value == null) return <span className={cn("num text-muted-foreground", className)}>—</span>;
  return (
    <span className={cn("num", className)}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function LiveIndicator({ connected, lastUpdated }: { connected: boolean; lastUpdated: Date | null }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className={cn("h-2.5 w-2.5 rounded-full", connected ? "bg-success animate-pulse-ring" : "bg-warning")} />
        {connected ? "Live" : "Polling every 10s"}
      </span>
      {lastUpdated && (
        <span className="num hidden sm:inline">Updated {lastUpdated.toLocaleTimeString()}</span>
      )}
    </div>
  );
}

export function SlotPips({ used }: { used: number }) {
  const left = Math.max(0, SLOT_LIMIT - used);
  return (
    <div className="flex items-center gap-4">
      <div className="flex gap-2" aria-label={`${used} of ${SLOT_LIMIT} slots used`}>
        {Array.from({ length: SLOT_LIMIT }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-10 rounded-full border transition-all duration-500",
              i < used ? "bg-primary border-primary glow-primary" : "bg-muted border-border",
            )}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">
        <span className="num text-foreground">{left}</span> of {SLOT_LIMIT} left
      </span>
    </div>
  );
}

export function StateBox({
  title,
  body,
  tone = "muted",
  children,
}: {
  title: string;
  body?: string;
  tone?: "muted" | "error";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "glass rounded-2xl p-10 text-center",
        tone === "error" && "border-destructive/40",
      )}
    >
      <p className={cn("text-lg font-semibold", tone === "error" && "text-destructive")}>{title}</p>
      {body && <p className="mt-2 text-muted-foreground">{body}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
