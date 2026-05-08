/**
 * License plates from SCS saves arrive with two layers of decoration:
 *   1. Optional inline `<color value=AARRGGBB>…</color>` markup the game uses
 *      to tint the plate text on dark/light backgrounds.
 *   2. A trailing `|state` suffix that names the issuing state.
 * Strip the markup and split the suffix into a friendlier form for display.
 */

export interface ParsedLicensePlate {
  text: string;
  state: string | null;
  /** ARGB hex from the color tag, when present (e.g. "FF650000"). */
  color: string | null;
}

const COLOR_TAG = /<color\s+value\s*=\s*([0-9A-Fa-f]{6,8})\s*>/g;
const CLOSING_TAG = /<\/color>/g;

export function parseLicensePlate(raw: string | null | undefined): ParsedLicensePlate | null {
  if (!raw) return null;

  let color: string | null = null;
  const colorMatch = COLOR_TAG.exec(raw);
  if (colorMatch) color = colorMatch[1].toUpperCase();
  COLOR_TAG.lastIndex = 0;

  const stripped = raw.replace(COLOR_TAG, "").replace(CLOSING_TAG, "").trim();
  const [text, stateRaw] = stripped.split("|");

  return {
    text: (text ?? "").trim(),
    state: stateRaw ? prettifyState(stateRaw.trim()) : null,
    color,
  };
}

function prettifyState(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
