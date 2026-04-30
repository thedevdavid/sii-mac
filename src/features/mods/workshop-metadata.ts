import type { FullModInfo, WorkshopMetadata, WorkshopMetadataMap } from "./types";

/**
 * Extract the set of Steam Workshop IDs from a mod list. Skips local mods and
 * deduplicates so a batched metadata fetch doesn't double-request.
 */
export function extractWorkshopIds(mods: FullModInfo[]): string[] {
  const seen = new Set<string>();
  for (const mod of mods) {
    if (mod.workshop_id) seen.add(mod.workshop_id);
  }
  return [...seen];
}

/** A mod row with optional Workshop metadata attached. */
export interface EnrichedMod extends FullModInfo {
  workshop?: WorkshopMetadata;
}

/** Attach Workshop metadata to a mod when available. */
export function mergeWorkshopMetadata(
  mod: FullModInfo,
  map: WorkshopMetadataMap | undefined,
): EnrichedMod {
  if (!map || !mod.workshop_id) return mod;
  const metadata = map[mod.workshop_id];
  return metadata ? { ...mod, workshop: metadata } : mod;
}

/**
 * Format a subscriber count as a compact string (e.g. "1.2k", "15.3k", "1.5M").
 * Returns "0" for falsy values.
 */
export function formatSubscriberCount(n: number | null | undefined): string {
  if (!n || n < 0) return "0";
  if (n < 1000) return n.toString();
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * Format a vote ratio as a percentage. Returns null when there are no votes.
 */
export function formatVoteRatio(
  up: number | null | undefined,
  down: number | null | undefined,
): string | null {
  const u = up ?? 0;
  const d = down ?? 0;
  const total = u + d;
  if (total === 0) return null;
  return `${Math.round((u / total) * 100)}%`;
}
