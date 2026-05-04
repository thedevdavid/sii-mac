import { describe, it, expect } from "vitest";
import { parseRecipe, shouldUseLegacyHints } from "./modset-recipe";

describe("parseRecipe", () => {
  it("returns no lines for empty input", () => {
    const r = parseRecipe("");
    expect(r.lines).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it("skips blank lines", () => {
    const r = parseRecipe("\n  \n");
    expect(r.lines).toEqual([]);
    expect(r.skipped.length).toBe(3);
    expect(r.skipped.every((s) => s.reason === "blank")).toBe(true);
  });

  it("identifies section dividers", () => {
    const r = parseRecipe("----- ADDITIONAL NON MAP MODS GO HERE -----");
    expect(r.lines).toEqual([]);
    expect(r.skipped[0].reason).toBe("section-divider");
  });

  it("identifies dash-and-equals dividers", () => {
    const r = parseRecipe(
      "===== GRAPHIC/WEATHER MOD COMPATIBILITY FILES =====",
    );
    expect(r.skipped[0].reason).toBe("section-divider");
  });

  it("identifies removal markers", () => {
    const r = parseRecipe(
      "****** Reforma Sierra Nevada ----- REMOVED FROM LOAD ORDER ******",
    );
    expect(r.lines).toEqual([]);
    expect(r.skipped[0].reason).toBe("removal-marker");
  });

  it("strips trailing **OPTIONAL** annotation and flags it", () => {
    const r = parseRecipe("ProMods Cabin **OPTIONAL**");
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].candidates).toEqual(["ProMods Cabin"]);
    expect(r.lines[0].notes.optional).toBe(true);
  });

  it("strips trailing -- **CHOSE NEAR…** annotation and flags variantChoice", () => {
    const r = parseRecipe(
      "ProMods Canada Definition Package -- **CHOSE NEAR THE TOP**",
    );
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].candidates).toEqual([
      "ProMods Canada Definition Package",
    ]);
    expect(r.lines[0].notes.variantChoice).toBe(true);
  });

  it("captures trailing game tag (ATS) but preserves other parentheticals", () => {
    const r = parseRecipe("FullScreen Maps (ATS)\nProMods (Global Edition)");
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].candidates).toEqual(["FullScreen Maps"]);
    expect(r.lines[0].notes.gameTag).toBe("ATS");
    expect(r.lines[1].candidates).toEqual(["ProMods (Global Edition)"]);
    expect(r.lines[1].notes.gameTag).toBeUndefined();
  });

  it("splits 'Mod A or Mod B' alternatives only when each side has 3+ words", () => {
    const r = parseRecipe(
      "Realistic Brutal Weather or Climatic Weather System Pro",
    );
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].candidates).toEqual([
      "Realistic Brutal Weather",
      "Climatic Weather System Pro",
    ]);
  });

  it("does not split short 'or' phrases (e.g., Coast to Coast)", () => {
    const r = parseRecipe("Coast to Coast");
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].candidates).toEqual(["Coast to Coast"]);
  });

  it("strips leading bullet markers", () => {
    const r = parseRecipe("- Mod A\n* Mod B\n1. Mod C");
    expect(r.lines.map((l) => l.candidates[0])).toEqual([
      "Mod A",
      "Mod B",
      "Mod C",
    ]);
  });

  it("normalizes smart quotes and em-dashes", () => {
    const r = parseRecipe("ProMods – Canada\n‘Realistic’ Brakes");
    expect(r.lines.map((l) => l.candidates[0])).toEqual([
      "ProMods - Canada",
      "'Realistic' Brakes",
    ]);
  });

  it("handles a real GMC recipe verbatim", () => {
    const recipe = [
      "----- ADDITIONAL NON MAP MODS GO HERE -----",
      "",
      "ProMods Canada Definition Package -- **CHOSE NEAR THE TOP**",
      "FullScreen Maps (ATS)",
      "Realistic Brutal Weather or Climatic Weather System Pro",
      "Project Better Arizona",
      "****** Reforma Sierra Nevada ----- REMOVED FROM LOAD ORDER ******",
      "===== GRAPHIC/WEATHER MOD COMPATIBILITY FILES =====",
      "ProMods Cabin **OPTIONAL**",
      "SCS Trailer Pack",
    ].join("\n");

    const r = parseRecipe(recipe);

    // 1 blank, 2 dividers, 1 removal-marker = 4 skipped
    expect(r.skipped).toHaveLength(4);
    expect(r.skipped.filter((s) => s.reason === "section-divider")).toHaveLength(
      2,
    );
    expect(r.skipped.filter((s) => s.reason === "removal-marker")).toHaveLength(
      1,
    );
    expect(r.skipped.filter((s) => s.reason === "blank")).toHaveLength(1);

    // 6 actionable lines
    expect(r.lines).toHaveLength(6);

    const byText = (idx: number) => r.lines[idx];
    expect(byText(0).candidates).toEqual([
      "ProMods Canada Definition Package",
    ]);
    expect(byText(0).notes.variantChoice).toBe(true);

    expect(byText(1).candidates).toEqual(["FullScreen Maps"]);
    expect(byText(1).notes.gameTag).toBe("ATS");

    expect(byText(2).candidates).toEqual([
      "Realistic Brutal Weather",
      "Climatic Weather System Pro",
    ]);

    expect(byText(3).candidates).toEqual(["Project Better Arizona"]);
    expect(byText(4).candidates).toEqual(["ProMods Cabin"]);
    expect(byText(4).notes.optional).toBe(true);
    expect(byText(5).candidates).toEqual(["SCS Trailer Pack"]);
  });
});

describe("shouldUseLegacyHints", () => {
  it("returns true for empty input", () => {
    expect(shouldUseLegacyHints(parseRecipe(""))).toBe(true);
  });

  it("returns true for a single bare word", () => {
    expect(shouldUseLegacyHints(parseRecipe("promods"))).toBe(true);
  });

  it("returns true for two short bare words", () => {
    expect(shouldUseLegacyHints(parseRecipe("promods\njazzycat"))).toBe(true);
  });

  it("returns false when input has skipped lines (recipe shape)", () => {
    expect(
      shouldUseLegacyHints(parseRecipe("----- HEADER -----\nMod")),
    ).toBe(false);
  });

  it("returns false when an alternative split exists", () => {
    expect(
      shouldUseLegacyHints(
        parseRecipe("Realistic Brutal Weather or Climatic Weather System Pro"),
      ),
    ).toBe(false);
  });

  it("returns false when a line has annotations", () => {
    expect(shouldUseLegacyHints(parseRecipe("ProMods Cabin **OPTIONAL**"))).toBe(
      false,
    );
  });

  it("returns false when a line has more than 4 tokens", () => {
    expect(
      shouldUseLegacyHints(parseRecipe("This is a really long mod name pack")),
    ).toBe(false);
  });
});
