import { useSyncExternalStore } from "react";

/**
 * "preview"  → show the proposed reorder in a dialog before committing
 * "immediate" → fire the reorder mutation as soon as the button is clicked
 */
export type AutoFixMode = "preview" | "immediate";

const STORAGE_KEY = "siimac-autofix-mode";
const DEFAULT_MODE: AutoFixMode = "preview";

function read(): AutoFixMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "immediate" || value === "preview" ? value : DEFAULT_MODE;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", handler);
  window.addEventListener("siimac-autofix-mode-change", onChange);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("siimac-autofix-mode-change", onChange);
  };
}

export function useAutoFixMode(): [AutoFixMode, (mode: AutoFixMode) => void] {
  const mode = useSyncExternalStore(subscribe, read, () => DEFAULT_MODE);
  const setMode = (next: AutoFixMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    // The native `storage` event only fires across tabs, so dispatch a
    // same-window event to notify the other consumer (settings page ↔
    // editor button live in the same tab).
    window.dispatchEvent(new Event("siimac-autofix-mode-change"));
  };
  return [mode, setMode];
}
