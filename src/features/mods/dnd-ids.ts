import type { ModId } from "@/lib/core-types";

/**
 * Typed drag-and-drop identifier helpers. The mod manager wraps both the
 * library and the playset editor in a single `DndContext`; prefixing the
 * drag IDs lets the `onDragEnd` handler dispatch to the right mutation
 * without ambiguity.
 */

export type DndSource = "library" | "playset";

export function libraryDndId(modId: ModId): string {
  return `library:${modId}`;
}

export function playsetDndId(modId: ModId): string {
  return `playset:${modId}`;
}

export interface ParsedDndId {
  source: DndSource;
  modId: ModId;
}

export function parseDndId(id: string | number): ParsedDndId | null {
  if (typeof id !== "string") return null;
  const colonIdx = id.indexOf(":");
  if (colonIdx < 0) return null;
  const source = id.slice(0, colonIdx);
  const modId = id.slice(colonIdx + 1);
  if (source !== "library" && source !== "playset") return null;
  if (modId.length === 0) return null;
  return { source, modId: modId as ModId };
}
