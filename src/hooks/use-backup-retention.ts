import { useSyncExternalStore } from "react";

/**
 * Retention policy applied to the SII Mac backups directory. Stored as a
 * single number: 0 means "keep everything", positive N means "keep the N
 * newest backups per profile, delete older ones". Lives in localStorage so
 * the renderer can read it synchronously during render without a Tauri call.
 */

const STORAGE_KEY = "siimac-backup-retention";
const DEFAULT_KEEP = 0;
const EVENT_NAME = "siimac-backup-retention-change";

function read(): number {
  if (typeof window === "undefined") return DEFAULT_KEEP;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw == null) return DEFAULT_KEEP;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_KEEP;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", handler);
  window.addEventListener(EVENT_NAME, onChange);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(EVENT_NAME, onChange);
  };
}

export function useBackupRetention(): [number, (next: number) => void] {
  const value = useSyncExternalStore(subscribe, read, () => DEFAULT_KEEP);
  const setValue = (next: number) => {
    const clamped = Math.max(0, Math.floor(next));
    window.localStorage.setItem(STORAGE_KEY, String(clamped));
    window.dispatchEvent(new Event(EVENT_NAME));
  };
  return [value, setValue];
}

/** Read the current retention value outside React (for one-shot calls). */
export function getBackupRetention(): number {
  return read();
}
