import { useProfileState } from "@/lib/profile-context";
import { SavePathSchema, type SavePath } from "@/lib/core-types";

/**
 * Build the active save's filesystem path from the selected profile and the
 * `$saveId` URL param. Returns `null` while no profile is selected so callers
 * can render a "no profile" empty state without throwing.
 */
export function useSavePath(saveId: string): SavePath | null {
  const { selectedProfile } = useProfileState();
  if (!selectedProfile) return null;
  return SavePathSchema.parse(`${selectedProfile.path}/save/${saveId}`);
}
