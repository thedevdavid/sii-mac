import { formatError } from "@/lib/format-error";
import { WorkshopIdSchema, type WorkshopId } from "@/lib/core-types";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
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
