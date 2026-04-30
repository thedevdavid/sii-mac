/**
 * Classify a save directory name in a single pass, returning both the
 * human-readable label and the category used for display badges. The two
 * functions below are thin wrappers so existing call sites don't need to
 * destructure when they only want one field.
 */

export type SaveType =
  | "Manual"
  | "Autosave"
  | "Job Autosave"
  | "Drive Autosave"
  | "Multiplayer"
  | "Other";

export interface SaveClassification {
  label: string;
  type: SaveType;
}

export function classifySave(dirName: string): SaveClassification {
  if (/^\d+$/.test(dirName)) {
    return { label: `Save #${dirName}`, type: "Manual" };
  }
  if (dirName === "autosave") {
    return { label: "Autosave", type: "Autosave" };
  }
  if (dirName === "autosave_job") {
    return { label: "Autosave (Job)", type: "Job Autosave" };
  }
  if (dirName.startsWith("autosave_job_")) {
    const suffix = dirName.split("_").pop() ?? "";
    return { label: `Autosave Job ${suffix}`, type: "Job Autosave" };
  }
  if (dirName === "autosave_drive") {
    return { label: "Autosave (Drive)", type: "Drive Autosave" };
  }
  if (dirName.startsWith("autosave_drive_")) {
    const suffix = dirName.split("_").pop() ?? "";
    return { label: `Autosave Drive ${suffix}`, type: "Drive Autosave" };
  }
  if (dirName.startsWith("multiplayer")) {
    return { label: "Multiplayer Backup", type: "Multiplayer" };
  }
  return { label: dirName.replace(/_/g, " "), type: "Other" };
}

/** Turn a save directory name into a human-readable label. */
export function prettifySaveDir(dirName: string): string {
  return classifySave(dirName).label;
}

/** Get save type category for display badges. */
export function getSaveType(dirName: string): SaveType {
  return classifySave(dirName).type;
}
