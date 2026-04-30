import { z } from "zod";
import { BackupPathSchema, GameSchema, TimestampSchema } from "@/lib/core-types";

/**
 * Backup feature types. `BackupInfo` is what `list_backups` returns.
 */

export const BackupInfoSchema = z.object({
  name: z.string(),
  path: BackupPathSchema,
  profile_name: z.string(),
  game: GameSchema,
  created_at: TimestampSchema,
});
export type BackupInfo = z.infer<typeof BackupInfoSchema>;
