/**
 * Pure helpers for the clone form's multi-select state:
 *   - formatSize: byte display
 *   - CheckState + groupCheckState: derive checkbox tri-state from items + selection
 *   - toggleGroupItems / toggleSingleItem: produce the next selection array
 *
 * Kept out of profile-clone.tsx so the UI file can stay focused on JSX.
 */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type CheckState = "all" | "none" | "some";

export function groupCheckState(items: string[], selected: string[]): CheckState {
  if (items.length === 0) return "none";
  const selectedSet = new Set(selected);
  const count = items.filter((i) => selectedSet.has(i)).length;
  if (count === 0) return "none";
  if (count === items.length) return "all";
  return "some";
}

export function toggleGroupItems(
  items: string[],
  current: string[],
  state: CheckState,
): string[] {
  const currentSet = new Set(current);
  if (state === "all") {
    for (const i of items) currentSet.delete(i);
  } else {
    for (const i of items) currentSet.add(i);
  }
  return Array.from(currentSet);
}

export function toggleSingleItem(item: string, current: string[]): string[] {
  const set = new Set(current);
  if (set.has(item)) set.delete(item);
  else set.add(item);
  return Array.from(set);
}
