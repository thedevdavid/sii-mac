/**
 * Fuzzy mod-name matcher used by the auto-fix dialog. Scores a recipe line
 * against every installed mod, accounting for:
 *
 *   • Diacritics — `Kögel` and `kogel` collapse to the same form.
 *   • Separators — `_+-./|` all become spaces.
 *   • Version tails — `_v2.0`, `_0.5.0.1_1.58`, ` RC`, ` 1.58` get stripped
 *     before scoring so users can match by mod-base name even when the local
 *     `.scs` file has a long suffix.
 *   • Stopwords — `the/a/an/of/for/and/mod/pack/addon/by` ignored as tokens.
 *
 * Pure functions, no dependencies. Designed to handle the
 * O(L × M × names) keystroke load (≈ a few thousand mods × names) in a
 * single React render.
 */

import type { ModId } from "@/lib/core-types";
import type { FullModInfo, PlaysetEntry, WorkshopMetadataMap } from "./types";
import type { ParsedRecipe, RecipeLine } from "./modset-recipe";

export interface NormalizedName {
  /** Lowercased, separator-flattened, version-tail-stripped form. */
  stripped: string;
  /** Same as `stripped` but version tail kept (used for tie-breaking). */
  full: string;
  /** Unique non-stopword tokens from `stripped`. */
  tokens: Set<string>;
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "and",
  "mod",
  "pack",
  "addon",
  "add-on",
  "by",
  "v",
]);

const VERSION_TAIL_RE =
  /\s+(?:v?\d+(?:\.\d+){0,3}[a-z]?|\d{4}|rc\d*|beta\d*|alpha\d*)$/i;

const COMBINING_MARKS_RE = /[̀-ͯ]/g;

export function normalize(input: string): NormalizedName {
  if (!input) return { stripped: "", full: "", tokens: new Set() };

  const decomposed = input.normalize("NFKD").replace(COMBINING_MARKS_RE, "");

  const flat = decomposed
    .toLowerCase()
    .replace(/[_+\-./|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let stripped = flat;
  // Strip recognized version tails repeatedly until stable. Bound the loop
  // so a degenerate input can't spin forever.
  for (let pass = 0; pass < 16; pass++) {
    const next = stripped.replace(VERSION_TAIL_RE, "").trim();
    if (next === stripped) break;
    stripped = next;
  }

  const tokens = new Set<string>();
  for (const t of stripped.split(" ")) {
    if (!t || STOPWORDS.has(t)) continue;
    tokens.add(t);
  }

  return { stripped, full: flat, tokens };
}

export interface SearchIndexEntry {
  modId: ModId;
  /** Up to 3 normalized names (workshop title, manifest name, mod id). */
  names: NormalizedName[];
}

export type SearchIndex = readonly SearchIndexEntry[];

export function buildModSearchIndex(
  entries: readonly PlaysetEntry[],
  modsById: ReadonlyMap<ModId, FullModInfo>,
  workshopMap: WorkshopMetadataMap | undefined,
): SearchIndex {
  const out: SearchIndexEntry[] = [];
  for (const entry of entries) {
    const mod = modsById.get(entry.mod_id);
    const names: NormalizedName[] = [];
    const seen = new Set<string>();

    const add = (raw: string | undefined | null) => {
      if (!raw) return;
      const n = normalize(raw);
      if (!n.stripped || seen.has(n.stripped)) return;
      seen.add(n.stripped);
      names.push(n);
    };

    if (mod?.workshop_id) {
      const ws = workshopMap?.[mod.workshop_id];
      if (ws?.title) add(ws.title);
    }
    add(mod?.display_name ?? entry.display_name);
    add(mod?.id ?? entry.mod_id);

    out.push({ modId: entry.mod_id, names });
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function lengthFactor(qLen: number, cLen: number): number {
  // Dampens scores when a very short query lands inside a long candidate.
  // E.g. typing `fix` against a 9-token mod name shouldn't score highly.
  if (qLen === 0 || cLen === 0) return 0;
  const ratio = Math.min(qLen, cLen) / Math.max(qLen, cLen);
  return 0.5 + ratio * 0.5;
}

export function score(query: NormalizedName, candidate: NormalizedName): number {
  if (!query.stripped || !candidate.stripped) return 0;
  if (query.stripped === candidate.stripped) return 1;
  if (query.full === candidate.full) return 0.99;

  const qTokens = query.tokens;
  const cTokens = candidate.tokens;

  const qSize = qTokens.size;
  const cSize = cTokens.size;

  if (qSize > 0 && cSize > 0) {
    let qInC = 0;
    for (const t of qTokens) if (cTokens.has(t)) qInC++;
    if (qInC === qSize) {
      // Query fully contained in candidate.
      return 0.85 + 0.1 * (qSize / cSize);
    }
    if (qInC === cSize && cSize < qSize) {
      // Candidate fully contained in query.
      return 0.7 + 0.1 * (cSize / qSize);
    }
  }

  const j = jaccard(qTokens, cTokens);
  const subQinC = candidate.stripped.includes(query.stripped) ? 0.6 : 0;
  const subCinQ = query.stripped.includes(candidate.stripped) ? 0.4 : 0;
  const substr = Math.max(subQinC, subCinQ);

  const raw = Math.max(j * 0.9, substr);
  return raw * lengthFactor(qSize || 1, cSize || 1);
}

/**
 * Pick the best score across a candidate's multiple normalized names.
 * Returns 0 if `entry.names` is empty.
 */
function bestScore(query: NormalizedName, entry: SearchIndexEntry): number {
  let best = 0;
  for (const name of entry.names) {
    const s = score(query, name);
    if (s > best) best = s;
  }
  return best;
}

export const MATCH_THRESHOLD = 0.55;
export const STRONG_MATCH_THRESHOLD = 0.8;

export interface RecipeMatch {
  lineNumber: number;
  candidateUsed: number;
  modId: ModId;
  score: number;
}

export interface UnmatchedRecipeLine {
  line: RecipeLine;
  /** Top candidates we tried (best first). Helps the user understand misses. */
  tried: { modId: ModId; score: number; name: string }[];
  /**
   * Set when this line's best match was a locked mod that another mechanism
   * already pinned in place. The matcher refuses to claim locked mods.
   */
  blockedByLock?: boolean;
}

export interface MatchedRecipe {
  matches: RecipeMatch[];
  unmatchedLines: UnmatchedRecipeLine[];
  /** Mod IDs in the index that no recipe line claimed. */
  extras: ModId[];
}

export interface MatchOptions {
  /**
   * Mods that should never be claimed by a recipe line — typically locked
   * playset entries. They still appear in `extras` only if not in this set;
   * locked mods are not extras (they're pinned, not free).
   */
  excludedModIds?: ReadonlySet<ModId>;
}

interface LineCandidate {
  modId: ModId;
  score: number;
  /** Which alternative on the recipe line produced this score. */
  candidateUsed: number;
}

export function matchRecipe(
  recipe: ParsedRecipe,
  index: SearchIndex,
  options: MatchOptions = {},
): MatchedRecipe {
  const excluded = options.excludedModIds ?? new Set<ModId>();

  const lineCandidates = new Map<number, LineCandidate[]>();

  for (const line of recipe.lines) {
    const queries = line.candidates.map((c) => normalize(c));
    const scored: LineCandidate[] = [];
    for (const entry of index) {
      if (excluded.has(entry.modId)) continue;
      let bestForEntry = 0;
      let bestCandidateIdx = 0;
      for (let q = 0; q < queries.length; q++) {
        const s = bestScore(queries[q], entry);
        if (s > bestForEntry) {
          bestForEntry = s;
          bestCandidateIdx = q;
        }
      }
      if (bestForEntry >= MATCH_THRESHOLD) {
        scored.push({
          modId: entry.modId,
          score: bestForEntry,
          candidateUsed: bestCandidateIdx,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    lineCandidates.set(line.lineNumber, scored.slice(0, 5));
  }

  const claimed = new Map<ModId, number>(); // modId -> lineNumber
  const matches: RecipeMatch[] = [];

  // Pass 1: strict (≥ STRONG_MATCH_THRESHOLD), in source order.
  for (const line of recipe.lines) {
    const cands = lineCandidates.get(line.lineNumber) ?? [];
    for (const c of cands) {
      if (claimed.has(c.modId)) continue;
      if (c.score < STRONG_MATCH_THRESHOLD) break;
      claimed.set(c.modId, line.lineNumber);
      matches.push({
        lineNumber: line.lineNumber,
        candidateUsed: c.candidateUsed,
        modId: c.modId,
        score: c.score,
      });
      break;
    }
  }

  // Pass 2: loose, only lines that didn't already match.
  const matchedLineNumbers = new Set(matches.map((m) => m.lineNumber));
  for (const line of recipe.lines) {
    if (matchedLineNumbers.has(line.lineNumber)) continue;
    const cands = lineCandidates.get(line.lineNumber) ?? [];
    for (const c of cands) {
      if (claimed.has(c.modId)) continue;
      claimed.set(c.modId, line.lineNumber);
      matches.push({
        lineNumber: line.lineNumber,
        candidateUsed: c.candidateUsed,
        modId: c.modId,
        score: c.score,
      });
      matchedLineNumbers.add(line.lineNumber);
      break;
    }
  }

  const fallbackName = (modId: ModId): string => {
    const entry = index.find((e) => e.modId === modId);
    return entry?.names[0]?.full ?? String(modId);
  };

  const unmatchedLines: UnmatchedRecipeLine[] = recipe.lines
    .filter((l) => !matchedLineNumbers.has(l.lineNumber))
    .map((line) => {
      const cands = lineCandidates.get(line.lineNumber) ?? [];
      return {
        line,
        tried: cands.slice(0, 3).map((c) => ({
          modId: c.modId,
          score: c.score,
          name: fallbackName(c.modId),
        })),
      };
    });

  const extras: ModId[] = [];
  for (const entry of index) {
    if (excluded.has(entry.modId)) continue;
    if (claimed.has(entry.modId)) continue;
    extras.push(entry.modId);
  }

  return { matches, unmatchedLines, extras };
}

/**
 * Legacy substring-cluster matcher. Each hint line claims every unlocked
 * entry whose any-name contains the hint (case-insensitive). Multiple hints
 * are processed in order; a mod cannot be claimed twice.
 */
export function matchSimpleHints(
  hints: readonly string[],
  index: SearchIndex,
  options: MatchOptions = {},
): { claimedInOrder: ModId[]; claimedSet: Set<ModId> } {
  const excluded = options.excludedModIds ?? new Set<ModId>();
  const claimedInOrder: ModId[] = [];
  const claimedSet = new Set<ModId>();

  for (const raw of hints) {
    const hint = raw.toLowerCase().trim();
    if (!hint) continue;
    for (const entry of index) {
      if (excluded.has(entry.modId)) continue;
      if (claimedSet.has(entry.modId)) continue;
      const matches = entry.names.some((n) => n.full.includes(hint));
      if (matches) {
        claimedInOrder.push(entry.modId);
        claimedSet.add(entry.modId);
      }
    }
  }

  return { claimedInOrder, claimedSet };
}
