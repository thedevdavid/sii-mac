import { formatError } from "@/lib/format-error";
import {
  WorkshopIdSchema,
  type GameBasePath,
  type WorkshopId,
} from "@/lib/core-types";
import { ensureModsDir } from "@/lib/tauri-commands";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

const WORKSHOP_PREFIX = "mod_workshop_package.";

/** Decode `mod_workshop_package.HEX` → decimal Steam Workshop item id. */
export function getWorkshopId(modId: string): WorkshopId | null {
  if (!modId.startsWith(WORKSHOP_PREFIX)) return null;
  const hex = modId.slice(WORKSHOP_PREFIX.length);
  const decimal = parseInt(hex, 16);
  if (Number.isNaN(decimal) || decimal === 0) return null;
  return WorkshopIdSchema.parse(decimal.toString());
}

export function getWorkshopUrl(modId: string): string | null {
  const id = getWorkshopId(modId);
  if (id === null) return null;
  return `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;
}

export async function revealInFinder(path: string) {
  try {
    await revealItemInDir(path);
  } catch (err) {
    toast.error(`Could not open in Finder: ${formatError(err)}`);
  }
}

/**
 * Open the installation's local mods folder (`{base}/mod`) in the OS file
 * manager, creating it first if it doesn't exist yet so a workshop-only or
 * fresh installation can still open (and drop mods into) it.
 */
export async function openModsFolder(basePath: GameBasePath) {
  try {
    const dir = await ensureModsDir(basePath);
    await openPath(dir);
  } catch (err) {
    toast.error(`Could not open mods folder: ${formatError(err)}`);
  }
}
