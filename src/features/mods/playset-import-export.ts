import { open, save } from "@tauri-apps/plugin-dialog";
import { exportPlayset, importPlayset } from "@/lib/tauri-commands";
import type { GameBasePath, PlaysetId } from "@/lib/core-types";
import type { Playset } from "./types";

/**
 * Open a save dialog and export the playset as JSON. Returns the destination
 * path the user picked, or null if they cancelled. Errors bubble up for the
 * caller to toast.
 */
export async function exportPlaysetToFile(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  defaultName: string,
): Promise<string | null> {
  const destination = await save({
    defaultPath: `${sanitizeFilename(defaultName)}.json`,
    filters: [{ name: "Playset", extensions: ["json"] }],
  });
  if (!destination) return null;
  await exportPlayset(basePath, playsetId, destination);
  return destination;
}

/**
 * Open a file-picker dialog and import a playset from JSON. Returns the
 * imported playset or null if the user cancelled.
 */
export async function importPlaysetFromFile(
  basePath: GameBasePath,
): Promise<Playset | null> {
  const source = await open({
    multiple: false,
    filters: [{ name: "Playset", extensions: ["json"] }],
  });
  if (!source || Array.isArray(source)) return null;
  return importPlayset(basePath, source);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "playset";
}
