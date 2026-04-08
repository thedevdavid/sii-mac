import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

const WORKSHOP_PREFIX = "mod_workshop_package.";

export function getWorkshopUrl(modId: string): string | null {
  if (!modId.startsWith(WORKSHOP_PREFIX)) return null;
  const hex = modId.slice(WORKSHOP_PREFIX.length);
  const decimal = parseInt(hex, 16);
  if (Number.isNaN(decimal)) return null;
  return `https://steamcommunity.com/sharedfiles/filedetails/?id=${decimal}`;
}

export async function revealInFinder(path: string) {
  try {
    await revealItemInDir(path);
  } catch (err) {
    toast.error(`Could not open in Finder: ${(err as Error).message ?? err}`);
  }
}

export async function openModLink(modId: string, basePath: string) {
  const workshopUrl = getWorkshopUrl(modId);
  if (workshopUrl) {
    try {
      await openUrl(workshopUrl);
    } catch (err) {
      toast.error(
        `Could not open Workshop page: ${(err as Error).message ?? err}`,
      );
    }
  } else {
    await revealInFinder(`${basePath}/mod`);
  }
}
