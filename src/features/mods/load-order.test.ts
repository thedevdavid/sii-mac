import { describe, expect, test } from "vitest";
import { ModIdSchema } from "@/lib/core-types";
import type { FullModInfo, PlaysetEntry } from "./types";
import { analyzeAndReorder } from "./load-order";

const mid = (s: string) => ModIdSchema.parse(s);

function entry(
  id: string,
  opts: { locked?: boolean; lock_group?: string | null } = {},
): PlaysetEntry {
  return {
    mod_id: mid(id),
    display_name: id,
    enabled: true,
    order: 0,
    locked: opts.locked ?? false,
    lock_group: opts.lock_group ?? null,
  };
}

function modInfo(id: string, categories: string[]): FullModInfo {
  return {
    id: mid(id),
    display_name: id,
    status: "active",
    source: "local",
    categories,
    compatible_versions: [],
    workshop_id: null,
  } as FullModInfo;
}

describe("analyzeAndReorder lock_group", () => {
  test("group members stay contiguous in their original relative order", () => {
    // Without grouping, priorities would scatter these: trucks (5), maps (11),
    // ui (1). With group "g1" tying truck-1, truck-2, map-1, they should stay
    // adjacent at the position auto-fix would place the first hit.
    const entries = [
      entry("truck-1", { lock_group: "g1" }),
      entry("ui-1"),
      entry("truck-2", { lock_group: "g1" }),
      entry("map-1", { lock_group: "g1" }),
      entry("truck-3"),
    ];
    const mods = new Map<ReturnType<typeof mid>, FullModInfo>([
      [mid("truck-1"), modInfo("truck-1", ["truck"])],
      [mid("truck-2"), modInfo("truck-2", ["truck"])],
      [mid("truck-3"), modInfo("truck-3", ["truck"])],
      [mid("ui-1"), modInfo("ui-1", ["ui"])],
      [mid("map-1"), modInfo("map-1", ["map"])],
    ]);
    const plan = analyzeAndReorder(entries, mods, undefined);

    // ui-1 wins priority 1 (highest precedence), so it goes first.
    expect(plan.plannedOrder[0]).toBe(mid("ui-1"));

    // The group [truck-1, truck-2, map-1] stays adjacent in this exact order.
    const groupStart = plan.plannedOrder.indexOf(mid("truck-1"));
    expect(groupStart).toBeGreaterThan(0);
    expect(plan.plannedOrder[groupStart + 1]).toBe(mid("truck-2"));
    expect(plan.plannedOrder[groupStart + 2]).toBe(mid("map-1"));

    // Total length and uniqueness preserved.
    expect(plan.plannedOrder).toHaveLength(entries.length);
    expect(new Set(plan.plannedOrder).size).toBe(entries.length);
  });

  test("locked member dissolves the group for that run", () => {
    const entries = [
      entry("a", { lock_group: "g1" }),
      entry("b"),
      entry("c", { lock_group: "g1", locked: true }),
      entry("d", { lock_group: "g1" }),
    ];
    const mods = new Map<ReturnType<typeof mid>, FullModInfo>([
      [mid("a"), modInfo("a", ["truck"])],
      [mid("b"), modInfo("b", ["ui"])],
      [mid("c"), modInfo("c", ["map"])],
      [mid("d"), modInfo("d", ["truck"])],
    ]);
    const plan = analyzeAndReorder(entries, mods, undefined);

    // c stayed at index 2 (locked).
    expect(plan.plannedOrder[2]).toBe(mid("c"));
    // b (ui, priority 1) wins position 0.
    expect(plan.plannedOrder[0]).toBe(mid("b"));
    // No length drift.
    expect(plan.plannedOrder).toHaveLength(entries.length);
    expect(new Set(plan.plannedOrder).size).toBe(entries.length);
  });

  test("no lock groups → output is identical to legacy auto-fix", () => {
    const entries = [
      entry("a"),
      entry("b"),
      entry("c"),
    ];
    const mods = new Map<ReturnType<typeof mid>, FullModInfo>([
      [mid("a"), modInfo("a", ["map"])],
      [mid("b"), modInfo("b", ["ui"])],
      [mid("c"), modInfo("c", ["truck"])],
    ]);
    const plan = analyzeAndReorder(entries, mods, undefined);
    // ui (1) → truck (5) → map (11)
    expect(plan.plannedOrder).toEqual([mid("b"), mid("c"), mid("a")]);
  });
});
