import { describe, it, expect } from "vitest";
import { compareRank, pickBest, usedSlots, countsTowardLimit } from "./ranking";

describe("ranking", () => {
  it("ranks higher accuracy first", () => {
    expect(compareRank({ accuracy: 0.9, latency_ms: 50, peak_ram_mb: 10 }, { accuracy: 0.8, latency_ms: 1, peak_ram_mb: 1 })).toBeLessThan(0);
  });
  it("breaks accuracy ties by lower latency", () => {
    expect(compareRank({ accuracy: 0.9, latency_ms: 20, peak_ram_mb: 99 }, { accuracy: 0.9, latency_ms: 30, peak_ram_mb: 1 })).toBeLessThan(0);
  });
  it("breaks latency ties by lower peak RAM", () => {
    expect(compareRank({ accuracy: 0.9, latency_ms: 20, peak_ram_mb: 5 }, { accuracy: 0.9, latency_ms: 20, peak_ram_mb: 8 })).toBeLessThan(0);
  });
  it("best ignores non-completed submissions", () => {
    const best = pickBest([
      { id: "a", status: "failed_oom", accuracy: 0.99, latency_ms: 1, peak_ram_mb: 1 },
      { id: "b", status: "completed", accuracy: 0.7, latency_ms: 1, peak_ram_mb: 1 },
    ]);
    expect(best?.id).toBe("b");
  });
});

describe("slot counting", () => {
  it("failed submissions do not count; disqualified does", () => {
    expect(countsTowardLimit("failed_prelim")).toBe(false);
    expect(countsTowardLimit("failed_runtime")).toBe(false);
    expect(countsTowardLimit("disqualified")).toBe(true);
    expect(countsTowardLimit("pending_prelim")).toBe(true);
  });
  it("counts in-flight and completed submissions", () => {
    expect(usedSlots([{ status: "running" }, { status: "completed" }, { status: "failed_timeout" }])).toBe(2);
  });
});
