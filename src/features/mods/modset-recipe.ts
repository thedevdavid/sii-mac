/**
 * Recipe parser for the auto-fix dialog. Real-world load-order recipes pasted
 * from GMC Community, ProMods Forums, MLog, or similar sources contain
 * structural noise — section dividers, `**OPTIONAL/RECOMMENDED**` annotations,
 * `Mod A or Mod B` alternatives, version-suffixed names, inline removal
 * markers, and trailing game tags like `(ATS)`. This module reduces a raw
 * textarea string to a structured `ParsedRecipe` that the fuzzy matcher can
 * consume cleanly.
 */

export type SkipReason =
  | "blank"
  | "section-divider"
  | "removal-marker"
  | "comment";

export interface RecipeLine {
  /** 0-based source index in the original textarea content. */
  lineNumber: number;
  /** The unmodified source line (used for diagnostics). */
  raw: string;
  /**
   * One or more cleaned candidate names. Length > 1 only for
   * "Mod A or Mod B" alternatives.
   */
  candidates: string[];
  notes: {
    gameTag?: "ATS" | "ETS2";
    optional?: boolean;
    variantChoice?: boolean;
  };
}

export interface SkippedLine {
  lineNumber: number;
  raw: string;
  reason: SkipReason;
}

export interface ParsedRecipe {
  /** Matchable lines, in source order. */
  lines: RecipeLine[];
  skipped: SkippedLine[];
}

const REMOVAL_MARKER_RE =
  /(?:\*{3,}|-{3,}|={3,}).*\b(?:REMOVED|EXCLUDE|EXCLUDED|DO NOT USE|DEPRECATED)\b.*(?:\*{3,}|-{3,}|={3,})/i;

const SECTION_DIVIDER_RE = /(?:^|\s)(?:[-=]{3,})/;

const TRAILING_DASHED_BOLD_RE = /\s*--\s*\*\*[^*]*\*\*\s*$/;
const TRAILING_BOLD_RE = /\s*\*\*[^*]*\*\*\s*$/;
const TRAILING_PAREN_NOTE_RE =
  /\s*\(@?\s*(?:see|note|requires?|use|skip|after|before|by|via)[^)]*\)\s*$/i;
const TRAILING_GAME_TAG_RE = /\s*\(\s*(ATS|ETS2)\s*\)\s*$/i;

const SMART_QUOTE_RE = /[‘’‚‛]/g;
const SMART_DQUOTE_RE = /[“”„‟]/g;
const EM_DASH_RE = /[–—−]/g;
const NBSP_RE = /[   ]/g;

function preNormalize(text: string): string {
  return text
    .replace(SMART_QUOTE_RE, "'")
    .replace(SMART_DQUOTE_RE, '"')
    .replace(EM_DASH_RE, "-")
    .replace(NBSP_RE, " ");
}

function isSectionDivider(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Need at least one run of >=3 dashes/equals to act as a divider.
  if (!SECTION_DIVIDER_RE.test(trimmed)) return false;
  // Strip ornament chars; what remains must be empty or fully uppercase
  // (with optional spaces / digits / a few separators).
  const inner = trimmed.replace(/[-=*\s]+/g, " ").trim();
  if (!inner) return true;
  return inner === inner.toUpperCase() && /[A-Z]/.test(inner);
}

interface AnnotationStripResult {
  text: string;
  optional: boolean;
  variantChoice: boolean;
}

function stripAnnotations(input: string): AnnotationStripResult {
  let text = input;
  let optional = false;
  let variantChoice = false;

  // Strip trailing parenthetical notes that are clearly meta-commentary.
  // Loop because some lines stack multiple notes.
  for (let pass = 0; pass < 3; pass++) {
    const before = text;
    text = text.replace(TRAILING_PAREN_NOTE_RE, "").trimEnd();
    if (text === before) break;
  }

  // `-- **CHOSE NEAR…**` form — capture before stripping so we can flag.
  const dashedBold = text.match(TRAILING_DASHED_BOLD_RE);
  if (dashedBold) {
    const inner = dashedBold[0];
    if (/optional|recommended/i.test(inner)) optional = true;
    if (/chose|choose|version|select|pick/i.test(inner)) variantChoice = true;
    text = text.replace(TRAILING_DASHED_BOLD_RE, "").trimEnd();
  }

  // Plain `**OPTIONAL/RECOMMENDED**` form.
  const bold = text.match(TRAILING_BOLD_RE);
  if (bold) {
    const inner = bold[0];
    if (/optional|recommended/i.test(inner)) optional = true;
    if (/chose|choose|version|select|pick/i.test(inner)) variantChoice = true;
    text = text.replace(TRAILING_BOLD_RE, "").trimEnd();
  }

  return { text, optional, variantChoice };
}

function extractGameTag(input: string): {
  text: string;
  gameTag?: "ATS" | "ETS2";
} {
  const match = input.match(TRAILING_GAME_TAG_RE);
  if (!match) return { text: input };
  const tag = match[1].toUpperCase() as "ATS" | "ETS2";
  return { text: input.replace(TRAILING_GAME_TAG_RE, "").trimEnd(), gameTag: tag };
}

function splitOrAlternatives(input: string): string[] {
  // Only split on whitespace-bounded "or" when each side is at least three
  // words — keeps "Coast to Coast" intact.
  const parts = input.split(/\s+\bor\b\s+/i);
  if (parts.length < 2) return [input];
  const allLong = parts.every((p) => p.trim().split(/\s+/).length >= 3);
  if (!allLong) return [input];
  return parts.map((p) => p.trim()).filter(Boolean);
}

function normalizeLeadingBullets(input: string): string {
  // Strip bullet glyphs / leading list markers that recipes often use.
  return input
    .replace(/^[\s]*[-*•·]\s+/, "")
    .replace(/^[\s]*\d+[.)]\s+/, "")
    .trimStart();
}

export function parseRecipe(text: string): ParsedRecipe {
  const lines: RecipeLine[] = [];
  const skipped: SkippedLine[] = [];

  if (!text) return { lines, skipped };

  const sourceLines = preNormalize(text).split(/\r?\n/);

  sourceLines.forEach((raw, lineNumber) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      skipped.push({ lineNumber, raw, reason: "blank" });
      return;
    }

    if (REMOVAL_MARKER_RE.test(trimmed)) {
      skipped.push({ lineNumber, raw, reason: "removal-marker" });
      return;
    }

    if (isSectionDivider(trimmed)) {
      skipped.push({ lineNumber, raw, reason: "section-divider" });
      return;
    }

    const debulleted = normalizeLeadingBullets(trimmed);

    const annot = stripAnnotations(debulleted);
    const tagged = extractGameTag(annot.text);

    // Collapse internal whitespace.
    const cleaned = tagged.text.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      skipped.push({ lineNumber, raw, reason: "comment" });
      return;
    }

    const candidates = splitOrAlternatives(cleaned).filter((c) => c.length >= 3);
    if (candidates.length === 0) {
      skipped.push({ lineNumber, raw, reason: "comment" });
      return;
    }

    const notes: RecipeLine["notes"] = {};
    if (tagged.gameTag) notes.gameTag = tagged.gameTag;
    if (annot.optional) notes.optional = true;
    if (annot.variantChoice) notes.variantChoice = true;

    lines.push({ lineNumber, raw, candidates, notes });
  });

  return { lines, skipped };
}

/**
 * Heuristic that decides whether the user's input should run through the
 * legacy "cluster every match" hint path or the structured recipe matcher.
 *
 * The bare-word case (e.g. typing `promods` to lasso every ProMods piece)
 * has to keep working unchanged. Anything that smells like a real recipe —
 * skipped lines, annotations, multi-token lines — switches to the recipe
 * matcher.
 */
export function shouldUseLegacyHints(parsed: ParsedRecipe): boolean {
  if (parsed.skipped.length > 0) return false;
  if (parsed.lines.length === 0) return true;
  for (const line of parsed.lines) {
    if (line.candidates.length > 1) return false;
    if (line.notes.gameTag || line.notes.optional || line.notes.variantChoice)
      return false;
    const tokenCount = line.candidates[0].split(/\s+/).length;
    if (tokenCount > 4) return false;
  }
  return true;
}
