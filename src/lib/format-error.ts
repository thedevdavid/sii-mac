import { AppErrorSchema } from "@/lib/core-types";

/**
 * Extract a human-readable message from an unknown error.
 * Handles Tauri backend errors ({kind, message}), JS Errors, and fallbacks.
 *
 * Unknown error shapes are logged to the console with their raw value so novel
 * failure modes stay traceable in devtools instead of silently becoming
 * "An unknown error occurred".
 */
export function formatError(err: unknown): string {
  // Tauri backend error: { kind: string, message: string }
  const parsed = AppErrorSchema.safeParse(err);
  if (parsed.success) {
    return parsed.data.message;
  }

  // Standard JS Error
  if (err instanceof Error) {
    return err.message;
  }

  // String error
  if (typeof err === "string") {
    return err;
  }

  // eslint-disable-next-line no-console
  console.error("[format-error] unrecognized error shape", { error: err });
  return "An unknown error occurred";
}

/**
 * Flatten TanStack Form's `field.state.meta.errors` into a single display
 * string. Each entry can be a string, a Zod issue, or some other object
 * shape, so the helper normalizes them the same way form field renderers
 * need — callers get a single comma-joined string or empty.
 */
export function formatFieldErrors(errors: unknown[]): string {
  return errors
    .filter(Boolean)
    .map((err) => {
      if (typeof err === "string") return err;
      if (err && typeof err === "object" && "message" in err) {
        return String((err as { message: unknown }).message);
      }
      return String(err);
    })
    .join(", ");
}
