import { describe, it, expect } from "vitest";
import {
  buildModSearchIndex,
  matchRecipe,
  matchSimpleHints,
  normalize,
  score,
} from "./fuzzy-mod-match";
import { parseRecipe } from "./modset-recipe";
import { ModIdSchema, WorkshopIdSchema } from "@/lib/core-types";
import type { FullModInfo, PlaysetEntry, WorkshopMetadataMap } from "./types";

const mid = (s: string) => ModIdSchema.parse(s);

function entry(id: string, name: string, locked = false): PlaysetEntry {
  return {
    mod_id: mid(id),
    display_name: name,
    enabled: true,
    order: 0,
    locked,
    lock_group: null,
  };
}

function info(id: string, name: string, source: "workshop" | "local" = "local"): FullModInfo {
  return {
    id: mid(id),
    display_name: name,
    status: "active",
    source,
    categories: [],
    compatible_versions: [],
    workshop_id: undefined,
  };
}

describe("normalize", () => {
  it("strips diacritics", () => {
    expect(normalize("Kögel").stripped).toBe("kogel");
    expect(normalize("Schwarzmüller").stripped).toBe("schwarzmuller");
  });

  it("collapses separators to single spaces", () => {
    expect(normalize("Project_Better_Arizona").stripped).toBe(
      "project better arizona",
    );
    expect(normalize("ProMods-Canada/Definition").stripped).toBe(
      "promods canada definition",
    );
  });

  it("strips trailing version tails", () => {
    expect(normalize("Project Better Arizona 0.5.0.1").stripped).toBe(
      "project better arizona",
    );
    expect(normalize("Mod v2.0").stripped).toBe("mod");
    expect(normalize("Mod 1.58").stripped).toBe("mod");
    expect(normalize("Mod RC").stripped).toBe("mod");
    expect(normalize("Mod Beta3").stripped).toBe("mod");
  });

  it("strips chained version tails", () => {
    expect(
      normalize("Project_Better_Arizona_0.5.0.1_1.58").stripped,
    ).toBe("project better arizona");
  });

  it("keeps 'Fix' / 'Edition' as part of the name", () => {
    expect(normalize("ATS Expansion Fix").stripped).toBe(
      "ats expansion fix",
    );
    expect(normalize("ProMods Global Edition").stripped).toBe(
      "promods global edition",
    );
  });

  it("removes stopwords from tokens", () => {
    const n = normalize("The Mod for Trucks Pack");
    expect([...n.tokens].sort()).toEqual(["trucks"]);
  });
});

describe("score", () => {
  it("returns 1 for exact stripped equality", () => {
    expect(score(normalize("ProMods"), normalize("promods"))).toBe(1);
  });

  it("scores high for query-fully-contained-in-candidate", () => {
    const s = score(
      normalize("Project Better Arizona"),
      normalize("Project_Better_Arizona_0.5.0.1_1.58"),
    );
    expect(s).toBeGreaterThanOrEqual(0.95);
  });

  it("matches across diacritics", () => {
    const s = score(normalize("Kögel"), normalize("kogel trailer pack"));
    expect(s).toBeGreaterThanOrEqual(0.55);
  });

  it("does not strongly match unrelated names", () => {
    expect(
      score(normalize("ProMods"), normalize("Realistic Brutal Weather")),
    ).toBeLessThan(0.55);
  });

  it("distinguishes 'Mod' from 'Mod Fix'", () => {
    const a = score(normalize("ATS Expansion"), normalize("ATS Expansion"));
    const b = score(normalize("ATS Expansion"), normalize("ATS Expansion Fix"));
    expect(a).toBeGreaterThan(b);
  });
});

describe("buildModSearchIndex", () => {
  it("includes workshop title, manifest name, and mod id", () => {
    const entries = [entry("workshop_123", "Workshop #123")];
    const wsId = WorkshopIdSchema.parse("123");
    const modsById = new Map<ReturnType<typeof mid>, FullModInfo>([
      [
        mid("workshop_123"),
        {
          ...info("workshop_123", "Workshop #123", "workshop"),
          workshop_id: wsId,
        },
      ],
    ]);
    const ws: WorkshopMetadataMap = {
      "123": {
        workshop_id: wsId,
        title: "ProMods Canada",
        description: "",
        tags: [],
      },
    };
    const idx = buildModSearchIndex(entries, modsById, ws);
    expect(idx[0].names.some((n) => n.stripped.includes("promods"))).toBe(
      true,
    );
  });
});

describe("matchRecipe", () => {
  it("matches Project Better Arizona to its versioned filename", () => {
    const e = [entry("project_better_arizona_0_5_0_1_1_58", "Project_Better_Arizona_0.5.0.1_1.58")];
    const modsById = new Map([
      [
        mid("project_better_arizona_0_5_0_1_1_58"),
        info(
          "project_better_arizona_0_5_0_1_1_58",
          "Project_Better_Arizona_0.5.0.1_1.58",
        ),
      ],
    ]);
    const idx = buildModSearchIndex(e, modsById, undefined);
    const recipe = parseRecipe("Project Better Arizona");
    const m = matchRecipe(recipe, idx);
    expect(m.matches).toHaveLength(1);
    expect(m.matches[0].score).toBeGreaterThanOrEqual(0.85);
  });

  it("does not claim locked mods", () => {
    const e = [entry("promods", "ProMods Canada", true)];
    const modsById = new Map([
      [mid("promods"), info("promods", "ProMods Canada")],
    ]);
    const idx = buildModSearchIndex(e, modsById, undefined);
    const recipe = parseRecipe("ProMods Canada");
    const m = matchRecipe(recipe, idx, {
      excludedModIds: new Set([mid("promods")]),
    });
    expect(m.matches).toHaveLength(0);
    expect(m.unmatchedLines).toHaveLength(1);
  });

  it("falls back to second alternative if first is missing", () => {
    const e = [entry("climatic", "Climatic Weather System Pro")];
    const modsById = new Map([
      [mid("climatic"), info("climatic", "Climatic Weather System Pro")],
    ]);
    const idx = buildModSearchIndex(e, modsById, undefined);
    const recipe = parseRecipe(
      "Realistic Brutal Weather or Climatic Weather System Pro",
    );
    const m = matchRecipe(recipe, idx);
    expect(m.matches).toHaveLength(1);
    expect(m.matches[0].modId).toBe(mid("climatic"));
    expect(m.matches[0].candidateUsed).toBe(1);
  });

  it("collects unmatched mods as extras", () => {
    const e = [
      entry("promods", "ProMods Canada"),
      entry("extra", "Some Extra Truck Pack"),
    ];
    const modsById = new Map([
      [mid("promods"), info("promods", "ProMods Canada")],
      [mid("extra"), info("extra", "Some Extra Truck Pack")],
    ]);
    const idx = buildModSearchIndex(e, modsById, undefined);
    const recipe = parseRecipe("ProMods Canada");
    const m = matchRecipe(recipe, idx);
    expect(m.matches).toHaveLength(1);
    expect(m.extras).toEqual([mid("extra")]);
  });

  it("strict pass claims in source order when multiple lines strongly match", () => {
    // Both lines strong-match the same mod; source-order resolves the tie.
    const e = [entry("a", "ProMods Canada Definition Package")];
    const modsById = new Map([
      [mid("a"), info("a", "ProMods Canada Definition Package")],
    ]);
    const idx = buildModSearchIndex(e, modsById, undefined);
    const recipe = parseRecipe(
      ["ProMods Canada Definition Package", "ProMods Canada"].join("\n"),
    );
    const m = matchRecipe(recipe, idx);
    expect(m.matches).toHaveLength(1);
    const claimedLine = m.matches[0].lineNumber;
    // First-listed (exact) line wins.
    expect(recipe.lines[claimedLine].raw).toContain("Definition Package");
  });
});

describe("matchSimpleHints", () => {
  it("clusters every match for a bare hint", () => {
    const e = [
      entry("a", "ProMods Cabin"),
      entry("b", "ProMods Canada"),
      entry("c", "Reforma"),
    ];
    const modsById = new Map([
      [mid("a"), info("a", "ProMods Cabin")],
      [mid("b"), info("b", "ProMods Canada")],
      [mid("c"), info("c", "Reforma")],
    ]);
    const idx = buildModSearchIndex(e, modsById, undefined);
    const { claimedInOrder, claimedSet } = matchSimpleHints(["promods"], idx);
    expect(claimedInOrder).toEqual([mid("a"), mid("b")]);
    expect(claimedSet.has(mid("c"))).toBe(false);
  });

  it("respects hint order", () => {
    const e = [
      entry("a", "Reforma"),
      entry("b", "ProMods Canada"),
    ];
    const modsById = new Map([
      [mid("a"), info("a", "Reforma")],
      [mid("b"), info("b", "ProMods Canada")],
    ]);
    const idx = buildModSearchIndex(e, modsById, undefined);
    const out = matchSimpleHints(["promods", "reforma"], idx);
    expect(out.claimedInOrder).toEqual([mid("b"), mid("a")]);
  });
});
