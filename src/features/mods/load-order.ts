import type { ModId } from "@/lib/core-types";
import type { FullModInfo, PlaysetEntry, WorkshopMetadataMap } from "./types";
import type { ParsedRecipe } from "./modset-recipe";
import {
  buildModSearchIndex,
  matchRecipe,
  matchSimpleHints,
  type MatchedRecipe,
  type RecipeMatch,
  type UnmatchedRecipeLine,
} from "./fuzzy-mod-match";

/**
 * Recommended SCS mod load order — community convention, since SCS Software
 * has explicitly stated no official ordering exists.
 *
 * Engine behavior — verified from authoritative SCS sources:
 *
 *   • SCS staff "SiSL" (forum.scssoft.com/viewtopic.php?t=200215):
 *     "top priority means upper side of the list" — i.e. the first entry in
 *     `active_mods[]` wins file-path conflicts.
 *   • SCS dev "Max" (forum.scssoft.com/viewtopic.php?t=188654, 2015):
 *     load order is "in fact unsolvable. any mod can edit any file by any
 *     way" — SCS deliberately punts ordering to the user.
 *   • SCS Modding Wiki, "Documentation/Engine/Mod manager" — `category[]` is
 *     UI grouping/filter metadata only. The engine does NOT use it for any
 *     priority resolution.
 *
 * So this module's ordering is a heuristic: it maps SCS's published 18-value
 * category enum to a community-consensus priority. The grouping/labels follow
 * "The Old Fart"'s 12-step convention (forum.scssoft.com/viewtopic.php?t=283517),
 * which is the most-cited non-fan reference and lines up with both ProMods'
 * official guide (promods.net/viewtopic.php?t=29618) and JBX Graphics' shipped
 * load-order PDF.
 *
 * SCS canonical 18-value category enum (manifest.sii `category[]`):
 *   truck, trailer, interior, tuning_parts, ai_traffic, sound, paint_job,
 *   cargo_pack, map, ui, weather_setup, physics, graphics, models, movers,
 *   walkers, prefabs, other
 *
 * `matchCategories` lists each canonical value plus user-authored variants
 * we've seen in the wild (e.g. "physics" vs "suspension"). A mod matching
 * multiple groups uses the smallest priority among them.
 */

export interface LoadOrderGroup {
  id: string;
  label: string;
  description: string;
  /** Lower = loaded earlier = higher precedence. */
  priority: number;
  /** Lowercased category strings that map a mod into this group. */
  matchCategories: readonly string[];
}

export const LOAD_ORDER_GROUPS: readonly LoadOrderGroup[] = [
  {
    id: "ai_traffic",
    label: "AI / Traffic",
    description:
      "AI vehicle packs, traffic density, driver behavior — overrides the truck definitions AI traffic uses, so it must sit above any vehicle mod.",
    priority: 1,
    matchCategories: ["ai_traffic", "ai", "traffic"],
  },
  {
    id: "physics",
    label: "Physics",
    description:
      "Suspension, transmission, handling — system-wide overrides for any vehicle-bundled physics tweaks underneath.",
    priority: 2,
    matchCategories: ["physics", "suspension", "handling"],
  },
  {
    id: "tuning_parts",
    label: "Tuning parts",
    description:
      "Wheels, lights, lightbars, accessory packs — modifications that need their target truck or trailer underneath them.",
    priority: 3,
    matchCategories: [
      "tuning_parts",
      "tuning_part",
      "tuning",
      "parts_tuning",
      "parts",
      "accessory",
      "accessories",
      "add_on",
      "addon",
      "addons",
      "truck_part",
      "truck_parts",
      "trailer_part",
      "trailer_parts",
      "wheel",
      "wheels",
      "lights",
    ],
  },
  {
    id: "interior",
    label: "Interior",
    description:
      "Cabin interior mods — sit above trucks since they replace cab assets the truck mod ships.",
    priority: 4,
    matchCategories: ["interior", "interiors"],
  },
  {
    id: "paint_job",
    label: "Paint jobs / Skins",
    description:
      "Paintjobs, liveries, decals, skins — applied on top of the vehicle they target.",
    priority: 5,
    matchCategories: [
      "paint_job",
      "paint_jobs",
      "paintjob",
      "paintjobs",
      "skin",
      "skins",
      "livery",
      "decals",
      "logo",
      "logos",
      "brand",
      "brands",
      "company",
      "companies",
    ],
  },
  {
    id: "truck",
    label: "Trucks",
    description: "Standalone truck definitions, truck packs, buses.",
    priority: 6,
    matchCategories: ["truck", "trucks", "vehicle", "bus", "buses"],
  },
  {
    id: "cargo_pack",
    label: "Cargo packs",
    description:
      "Cargo definitions — sit above trailers because cargo references trailer types.",
    priority: 7,
    matchCategories: ["cargo_pack", "cargo", "cargo_packs"],
  },
  {
    id: "trailer",
    label: "Trailers",
    description: "Standalone trailer definitions and trailer packs.",
    priority: 8,
    matchCategories: ["trailer", "trailers"],
  },
  {
    id: "graphics",
    label: "Graphics",
    description:
      "Visual mods, lighting, post-processing — overrides per-vehicle FX shipped inside truck/trailer mods below.",
    priority: 9,
    matchCategories: [
      "graphics",
      "graphic",
      "lighting",
      "lights",
      "fx",
      "shader",
      "shaders",
      "visual",
    ],
  },
  {
    id: "weather_setup",
    label: "Weather",
    description: "Weather, sky, climate — JBX, Realistic Brutal Weather, Frosty.",
    priority: 10,
    matchCategories: ["weather_setup", "weather"],
  },
  {
    id: "world_models",
    label: "World models",
    description:
      "Models, movers, walkers, prefabs — world assets that maps reference. Sit above maps so map mods can pick them up.",
    priority: 11,
    matchCategories: [
      "models",
      "model",
      "movers",
      "mover",
      "walkers",
      "walker",
      "prefabs",
      "prefab",
    ],
  },
  {
    id: "map",
    label: "Maps",
    description:
      "ProMods, RusMap, Reforma, Project regions — the base content layer. Add-on regional maps belong above their parent.",
    priority: 12,
    matchCategories: [
      "map",
      "maps",
      "map_fix",
      "map_fixes",
      "map_patch",
      "map_patches",
      "background_map",
      "map_background",
      "map_def",
      "city",
      "cities",
    ],
  },
  {
    id: "sound",
    label: "Sounds",
    description:
      "Engine sound packs, environmental audio. Mostly self-contained — community puts these low because they rarely conflict.",
    priority: 13,
    matchCategories: ["sound", "sounds", "audio"],
  },
  {
    id: "ui",
    label: "UI",
    description:
      "HUD, menu reskins, backgrounds — order-independent, lowest precedence.",
    priority: 14,
    matchCategories: ["ui", "background", "backgrounds", "skybox", "horizon"],
  },
  {
    id: "other",
    label: "Other",
    description: "Anything that doesn't match a more specific group.",
    priority: 15,
    matchCategories: ["other", "misc", "default", "defaults", "base", "core"],
  },
];

const DEFAULT_PRIORITY = LOAD_ORDER_GROUPS.find((g) => g.id === "other")!.priority;

/**
 * Normalize a raw category string from `manifest.sii` (typically already
 * lowercase, snake_case) or from a Steam Workshop tag (Title Case with
 * spaces, e.g. "Paint Job", "AI Traffic Mod", "Parts/Tuning"). Reduces both
 * to the same canonical key so a single `matchCategories` entry covers both
 * sources.
 */
function normalizeCategory(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s/\\]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_mod$/, "");
}

const CATEGORY_TO_PRIORITY: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (const group of LOAD_ORDER_GROUPS) {
    for (const cat of group.matchCategories) {
      const key = normalizeCategory(cat);
      const existing = map.get(key);
      if (existing === undefined || group.priority < existing) {
        map.set(key, group.priority);
      }
    }
  }
  return map;
})();

/**
 * Keyword → canonical-category dictionary for inference when a mod has
 * neither a `category[]` in its manifest nor a Workshop tags array. Each
 * entry's key is matched case-insensitively as a substring against
 * `display_name`, mod id, and (for Workshop mods) the Steam description.
 *
 * Curated to favor specificity over coverage — false positives ("everything
 * is Maps") are worse than a few misses falling through to "Other". Generic
 * terms like "fix" or "patch" are deliberately omitted because they appear
 * in mod names across every category.
 */
const TEXT_KEYWORDS: ReadonlyMap<string, string> = new Map([
  // ATS — US states & known map mods
  ["arizona", "map"],
  ["arazona", "map"],
  ["california", "map"],
  ["nevada", "map"],
  ["utah", "map"],
  ["oregon", "map"],
  ["washington", "map"],
  ["texas", "map"],
  ["idaho", "map"],
  ["wyoming", "map"],
  ["montana", "map"],
  ["colorado", "map"],
  ["new mexico", "map"],
  ["kansas", "map"],
  ["oklahoma", "map"],
  ["missouri", "map"],
  ["minnesota", "map"],
  ["iowa", "map"],
  ["nebraska", "map"],
  ["dakota", "map"],
  ["wisconsin", "map"],
  ["illinois", "map"],
  ["indiana", "map"],
  ["ohio", "map"],
  ["michigan", "map"],
  ["alaska", "map"],
  ["hawaii", "map"],
  ["radiator springs", "map"],
  ["radiator_springs", "map"],
  ["area 51", "map"],
  ["area_51", "map"],
  ["area51", "map"],
  ["truckmap", "map"],
  // ETS2 — European countries & known map mods
  ["germany", "map"],
  ["france", "map"],
  ["italy", "map"],
  ["spain", "map"],
  ["portugal", "map"],
  ["england", "map"],
  ["scotland", "map"],
  ["ireland", "map"],
  ["netherlands", "map"],
  ["belgium", "map"],
  ["denmark", "map"],
  ["norway", "map"],
  ["sweden", "map"],
  ["finland", "map"],
  ["iceland", "map"],
  ["poland", "map"],
  ["czech", "map"],
  ["slovakia", "map"],
  ["hungary", "map"],
  ["austria", "map"],
  ["switzerland", "map"],
  ["slovenia", "map"],
  ["croatia", "map"],
  ["romania", "map"],
  ["bulgaria", "map"],
  ["greece", "map"],
  ["turkey", "map"],
  ["promods", "map"],
  ["reforma", "map"],
  ["rusmap", "map"],
  ["road brasil", "map"],
  ["roadbrasil", "map"],
  ["middle east", "map"],
  ["great steppe", "map"],
  ["maghreb", "map"],
  ["roextended", "map"],
  ["sibirmap", "map"],
  ["caucasus", "map"],
  ["grand utopia", "map"],
  ["horn of africa", "map"],
  ["heart of africa", "map"],
  ["project japan", "map"],
  ["project russia", "map"],
  ["project straylia", "map"],
  ["trans-siberian", "map"],
  ["trans siberian", "map"],
  ["southern region", "map"],
  ["northern open", "map"],
  ["volgamap", "map"],
  ["srmap", "map"],
  ["poland rebuilding", "map"],
  ["spain revamp", "map"],
  ["abkhazia", "map"],
  ["cape verde", "map"],
  ["bulgaria in focus", "map"],
  ["archis armenia", "map"],
  ["silesia", "map"],
  ["eurafrica", "map"],
  ["beyond map", "map"],
  ["terramaps", "map"],
  ["coast to coast", "map"],
  ["more american cities", "map"],
  ["western canada", "map"],
  ["eastern canada", "map"],
  ["road to nunavut", "map"],
  ["pazzmod", "map"],
  ["viva mexico", "map"],
  ["paradise map", "map"],
  ["undiscovered roads", "map"],
  ["no deadends", "map"],
  ["no dead ends", "map"],
  ["off the grid", "map"],
  ["great america", "map"],
  ["real companies", "map"],
  ["gas stations", "map"],
  ["real brands", "map"],
  ["real advertisements", "map"],
  ["real big stop", "map"],
  // Maps — generic
  ["expansion", "map"],
  ["highway", "map"],
  // Trucks — manufacturers
  ["scania", "truck"],
  ["volvo", "truck"],
  ["kenworth", "truck"],
  ["peterbilt", "truck"],
  ["freightliner", "truck"],
  ["western star", "truck"],
  ["western_star", "truck"],
  ["mercedes", "truck"],
  ["renault", "truck"],
  ["iveco", "truck"],
  // Trucks — specific models
  ["kenworth t660", "truck"],
  ["kenworth t600", "truck"],
  ["kenworth k220", "truck"],
  ["kenworth needle", "truck"],
  ["peterbilt 281", "truck"],
  ["peterbilt 351", "truck"],
  ["peterbilt 352", "truck"],
  ["peterbilt 359", "truck"],
  ["peterbilt 379", "truck"],
  ["peterbilt 389", "truck"],
  ["peterbilt 579", "truck"],
  ["freightliner cascadia", "truck"],
  ["freightliner classic", "truck"],
  ["freightliner upgrades", "truck"],
  ["international 9300", "truck"],
  ["international 9400", "truck"],
  ["international 9900", "truck"],
  ["international lonestar", "truck"],
  ["mack superliner", "truck"],
  ["mack pinnacle", "truck"],
  ["mack anthem", "truck"],
  ["iveco s-way", "truck"],
  ["iveco s way", "truck"],
  ["renault premium", "truck"],
  ["renault magnum", "truck"],
  ["new actros", "truck"],
  ["actros mp2", "truck"],
  ["actros mp3", "truck"],
  ["actros mp4", "truck"],
  ["volvo fh16", "truck"],
  ["volvo fh3", "truck"],
  ["kalmar t2", "truck"],
  ["yard truck", "truck"],
  ["mercedes sprinter", "truck"],
  // Buses (categorized as truck for load-order purposes)
  ["bus mod", "truck"],
  ["marcopolo", "truck"],
  ["setra s516", "truck"],
  ["temsa safir", "truck"],
  ["tourismo", "truck"],
  ["viaggio", "truck"],
  // Trailers
  ["trailer", "trailer"],
  ["schmitz", "trailer"],
  ["krone", "trailer"],
  ["kogel", "trailer"],
  ["kögel", "trailer"],
  ["schwarzmuller", "trailer"],
  ["schwarzmüller", "trailer"],
  ["wielton", "trailer"],
  ["kraker", "trailer"],
  ["jazzycat trailer", "trailer"],
  ["sisl trailer pack", "trailer"],
  ["sisl's trailer pack", "trailer"],
  ["trailer pack", "trailer"],
  ["cargo pack", "trailer"],
  ["overweight trailer", "trailer"],
  ["belly dump", "trailer"],
  ["goldhofer", "trailer"],
  ["chereau", "trailer"],
  ["feldbinder", "trailer"],
  ["hellmann", "trailer"],
  ["fruehauf", "trailer"],
  ["jenkins supply", "trailer"],
  ["merrit goldline", "trailer"],
  ["signs on your trailer", "trailer"],
  // Sound
  ["sound", "sound"],
  ["engine sound", "sound"],
  ["sound fixes", "sound"],
  ["drive safely", "sound"],
  ["kriechbaum", "sound"],
  ["engine sound megapack", "sound"],
  ["open pipe", "sound"],
  ["straight pipe", "sound"],
  ["straight piped", "sound"],
  ["slav jerry", "sound"],
  ["robinicus", "sound"],
  ["dd13", "sound"],
  ["dd15", "sound"],
  ["detroit diesel sound", "sound"],
  ["cummins isx", "sound"],
  ["cummins x15", "sound"],
  ["cummins n14", "sound"],
  ["cat 3406", "sound"],
  ["cat c15", "sound"],
  ["paccar mx sound", "sound"],
  ["horn pack", "sound"],
  // AI / Traffic
  ["ai traffic", "ai_traffic"],
  ["ai_traffic", "ai_traffic"],
  ["realistic drivers", "ai_traffic"],
  ["realistic_drivers", "ai_traffic"],
  ["jazzycat", "ai_traffic"],
  ["cipinho", "ai_traffic"],
  ["ai traffic pack", "ai_traffic"],
  ["truck traffic pack", "ai_traffic"],
  ["real traffic density", "ai_traffic"],
  ["better traffic", "ai_traffic"],
  ["traffic mx", "ai_traffic"],
  ["police pack", "ai_traffic"],
  ["state troopers", "ai_traffic"],
  ["state police", "ai_traffic"],
  ["us state police", "ai_traffic"],
  ["canada police", "ai_traffic"],
  ["mexico police", "ai_traffic"],
  ["traffic light timing", "ai_traffic"],
  ["longer traffic lights", "ai_traffic"],
  ["enhanced scs traffic", "ai_traffic"],
  ["more ai traffic", "ai_traffic"],
  ["real ai country", "ai_traffic"],
  ["traffic trucks and trailers", "ai_traffic"],
  // Graphics / Weather
  ["graphics", "graphics"],
  ["weather", "weather_setup"],
  ["frosty", "weather_setup"],
  ["brutal weather", "weather_setup"],
  ["jbx", "graphics"],
  ["naturalux", "graphics"],
  ["realistic graphics mod", "graphics"],
  ["realistic brutal graphics", "graphics"],
  ["brutal graphics", "graphics"],
  ["project nextgen", "graphics"],
  ["png graphics", "graphics"],
  ["snowymoon", "graphics"],
  ["snowy moon", "graphics"],
  ["lighting improvements", "graphics"],
  ["realistic vehicle lights", "graphics"],
  ["vehicle lights mod", "graphics"],
  ["schumi", "graphics"],
  ["real lights", "graphics"],
  ["reflective road", "graphics"],
  ["road markings", "graphics"],
  ["ats headlight", "graphics"],
  ["reshade", "graphics"],
  ["4k textures", "graphics"],
  ["tree improved", "graphics"],
  ["frosty winter", "weather_setup"],
  ["frosty snow", "weather_setup"],
  ["grimes", "weather_setup"],
  ["grimesmods", "weather_setup"],
  ["early autumn", "weather_setup"],
  ["new summer", "weather_setup"],
  ["realistic rain", "weather_setup"],
  ["better raindrops", "weather_setup"],
  ["realistic weather", "weather_setup"],
  ["sky textures", "weather_setup"],
  // Skins / Paint jobs
  ["paintjob", "paint_job"],
  ["paint_job", "paint_job"],
  ["paint job", "paint_job"],
  ["livery", "paint_job"],
  ["skin pack", "paint_job"],
  ["paint pack", "paint_job"],
  ["livery pack", "paint_job"],
  ["trailer skin", "paint_job"],
  ["truck skin", "paint_job"],
  ["paulys", "paint_job"],
  ["goggles 56", "paint_job"],
  ["chat noir", "paint_job"],
  ["central freight", "paint_job"],
  ["maritime ontario", "paint_job"],
  ["texoma", "paint_job"],
  ["case agriculture", "paint_job"],
  ["gulf oil tanker", "paint_job"],
  ["jaws trailer", "paint_job"],
  ["carambar", "paint_job"],
  ["cabaïa", "paint_job"],
  ["lufthansa", "paint_job"],
  ["fm logistic", "paint_job"],
  ["gmc community", "paint_job"],
  // Physics
  ["physics", "physics"],
  ["suspension", "physics"],
  ["gearbox", "physics"],
  ["realistic truck physics", "physics"],
  ["frkn64", "physics"],
  ["real eaton", "physics"],
  ["eaton fuller", "physics"],
  ["realistic transmissions", "physics"],
  ["real transmission", "physics"],
  ["adyx50", "physics"],
  ["realistic brakes", "physics"],
  ["hardcore survival", "physics"],
  ["realistic economy", "physics"],
  ["real life ats", "physics"],
  ["real fuel prices", "physics"],
  // Interior
  ["interior", "interior"],
  ["cabin accessor", "interior"],
  ["sisl mega", "interior"],
  ["sisl's mega", "interior"],
  ["mega pack accessories", "interior"],
  ["dashboard", "interior"],
  ["full dashboard", "interior"],
  ["truck interior", "interior"],
  ["pete 579 ng interior", "interior"],
  ["owl bobblehead", "interior"],
  ["bobblehead", "interior"],
  ["co-driver", "interior"],
  // Tuning
  ["tuning", "tuning_parts"],
  ["lightbar", "tuning_parts"],
  ["light bar", "tuning_parts"],
  ["accessory pack", "tuning_parts"],
  ["smarty", "tuning_parts"],
  ["wheels pack", "tuning_parts"],
  ["extreme wheel", "tuning_parts"],
  ["tire pack", "tuning_parts"],
  ["painted air horn", "tuning_parts"],
  ["air horn", "tuning_parts"],
  ["truck accessories", "tuning_parts"],
  ["newer license plates", "tuning_parts"],
  ["license plate", "tuning_parts"],
  ["increased fuel", "tuning_parts"],
  // UI
  ["mirror fov", "ui"],
  ["mirror", "ui"],
  ["fov", "ui"],
  ["hud", "ui"],
  ["yara", "ui"],
  ["route advisor", "ui"],
  ["billybone99", "ui"],
  ["realistic fov", "ui"],
  ["map zoom", "ui"],
  ["navigation skin", "ui"],
  ["menu skin", "ui"],
  ["icons mod", "ui"],
]);

/**
 * Infer canonical category strings from arbitrary text (mod display_name,
 * id, or workshop description). Returns the union of all keyword matches.
 * `priorityForCategories` then picks the smallest-priority match.
 */
function inferCategoriesFromText(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matched = new Set<string>();
  for (const [keyword, category] of TEXT_KEYWORDS) {
    if (lower.includes(keyword)) matched.add(category);
  }
  return [...matched];
}

/**
 * Resolve the categories used for load-order grouping. Source priority,
 * highest-trust first:
 *
 *   1. `manifest.sii` `category[]` — authored by the modder, exact.
 *   2. Workshop tags — Steam-maintained, high-confidence enum.
 *   3. Inferred from `display_name` + mod id + (for workshop) Steam
 *      description text — heuristic. Saves most local map/sound/truck mods
 *      from falling into the "Other" bucket purely because they ship without
 *      a `category[]` line.
 *   4. Empty → falls through to "Other" via DEFAULT_PRIORITY.
 */
export function resolveModCategories(
  mod: FullModInfo,
  workshopMap: WorkshopMetadataMap | undefined,
): readonly string[] {
  if (mod.categories.length > 0) return mod.categories;
  if (mod.workshop_id && workshopMap?.[mod.workshop_id]?.tags?.length) {
    return workshopMap[mod.workshop_id].tags;
  }
  const description =
    (mod.workshop_id && workshopMap?.[mod.workshop_id]?.description) || "";
  const haystack = `${mod.display_name} ${mod.id} ${description}`;
  return inferCategoriesFromText(haystack);
}

/**
 * Resolve a mod's recommended-load-order priority from its manifest
 * categories. A mod with several categories takes the smallest matching
 * priority. Unknown / missing categories fall back to "Other".
 */
export function priorityForCategories(categories: readonly string[]): number {
  let best = DEFAULT_PRIORITY;
  let matched = false;
  for (const cat of categories) {
    const p = CATEGORY_TO_PRIORITY.get(normalizeCategory(cat));
    if (p !== undefined && (!matched || p < best)) {
      best = p;
      matched = true;
    }
  }
  return matched ? best : DEFAULT_PRIORITY;
}

export type ReorderInput =
  | { kind: "legacy"; hints: readonly string[] }
  | { kind: "recipe"; recipe: ParsedRecipe };

export interface ReorderPlan {
  plannedOrder: ModId[];
  /**
   * Recipe-mode diagnostics. `null` for legacy mode — the dialog falls back
   * to its simple "X of Y will move" copy in that case.
   */
  matched: MatchedRecipe | null;
}

/**
 * Plan a reorder of `entries` according to the recommended load order.
 *
 * Locked entries stay pinned at their original absolute indices. Every
 * unlocked entry receives a sort key:
 *
 *   sortKey(mod) = [priority, recipeRank, originalIndex]
 *
 * where `priority` comes from `priorityForCategories(resolveModCategories)`,
 * `recipeRank` is the recipe-line position for matched mods (or +Infinity
 * for extras), and `originalIndex` provides a stable tiebreak. Sorting
 * unlocked mods lexicographically by this key yields a band-by-band layout:
 * within a band, recipe-matched mods come first in recipe order, then
 * extras in their existing relative order. Across bands, lower priority
 * wins (top of list = highest precedence — SCS convention).
 *
 * Legacy mode preserves the original "cluster every hint match at the top"
 * behavior so a bare-word hint like `promods` still lassos the whole family.
 *
 * Pure — does not mutate inputs.
 */
export function analyzeAndReorder(
  entries: readonly PlaysetEntry[],
  modsById: ReadonlyMap<ModId, FullModInfo>,
  workshopMap: WorkshopMetadataMap | undefined,
  input: ReorderInput = { kind: "legacy", hints: [] },
): ReorderPlan {
  const lockedAt = new Map<number, ModId>();
  const unlocked: PlaysetEntry[] = [];
  const lockedSet = new Set<ModId>();
  const originalIndexById = new Map<ModId, number>();
  entries.forEach((entry, index) => {
    originalIndexById.set(entry.mod_id, index);
    if (entry.locked) {
      lockedAt.set(index, entry.mod_id);
      lockedSet.add(entry.mod_id);
    } else {
      unlocked.push(entry);
    }
  });

  const priorityForMod = (modId: ModId): number => {
    const mod = modsById.get(modId);
    return priorityForCategories(
      mod ? resolveModCategories(mod, workshopMap) : [],
    );
  };

  if (input.kind === "legacy") {
    const index = buildModSearchIndex(unlocked, modsById, workshopMap);
    const { claimedInOrder, claimedSet } = matchSimpleHints(
      input.hints,
      index,
    );

    const rest = unlocked.filter((e) => !claimedSet.has(e.mod_id));
    const sortedRest = [...rest].sort(
      (a, b) => priorityForMod(a.mod_id) - priorityForMod(b.mod_id),
    );

    const hintedEntries = claimedInOrder
      .map((modId) => unlocked.find((e) => e.mod_id === modId))
      .filter((e): e is PlaysetEntry => e !== undefined);
    const finalUnlocked: PlaysetEntry[] = [...hintedEntries, ...sortedRest];

    const result: ModId[] = new Array(entries.length);
    let cursor = 0;
    for (let i = 0; i < entries.length; i++) {
      const lockedMod = lockedAt.get(i);
      if (lockedMod !== undefined) {
        result[i] = lockedMod;
      } else {
        result[i] = finalUnlocked[cursor++].mod_id;
      }
    }
    return { plannedOrder: result, matched: null };
  }

  // Recipe mode — priority-banded interleaving.
  const index = buildModSearchIndex(unlocked, modsById, workshopMap);
  const matched = matchRecipe(input.recipe, index, {
    excludedModIds: lockedSet,
  });

  // recipeRank: line ordinal (within parsed.lines, NOT raw lineNumber) for
  // matched mods. Maps lineNumber → ordinal so the matcher's source-order
  // semantics translate to a contiguous rank.
  const lineOrdinal = new Map<number, number>();
  input.recipe.lines.forEach((line, ordinal) => {
    lineOrdinal.set(line.lineNumber, ordinal);
  });

  const recipeRankByMod = new Map<ModId, number>();
  for (const m of matched.matches) {
    const ord = lineOrdinal.get(m.lineNumber);
    if (ord !== undefined) recipeRankByMod.set(m.modId, ord);
  }

  const sortedUnlocked = [...unlocked].sort((a, b) => {
    const pa = priorityForMod(a.mod_id);
    const pb = priorityForMod(b.mod_id);
    if (pa !== pb) return pa - pb;
    const ra = recipeRankByMod.get(a.mod_id) ?? Number.POSITIVE_INFINITY;
    const rb = recipeRankByMod.get(b.mod_id) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    const ia = originalIndexById.get(a.mod_id) ?? 0;
    const ib = originalIndexById.get(b.mod_id) ?? 0;
    return ia - ib;
  });

  const result: ModId[] = new Array(entries.length);
  let cursor = 0;
  for (let i = 0; i < entries.length; i++) {
    const lockedMod = lockedAt.get(i);
    if (lockedMod !== undefined) {
      result[i] = lockedMod;
    } else {
      result[i] = sortedUnlocked[cursor++].mod_id;
    }
  }
  return { plannedOrder: result, matched };
}

export type { MatchedRecipe, RecipeMatch, UnmatchedRecipeLine };

/**
 * Returns true when the planned reorder leaves every mod_id in its current
 * index. Lets the UI skip a no-op IPC and surface a friendly toast instead.
 */
export function reorderIsNoOp(
  entries: readonly PlaysetEntry[],
  planned: readonly ModId[],
): boolean {
  if (entries.length !== planned.length) return false;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].mod_id !== planned[i]) return false;
  }
  return true;
}

/**
 * Compute the group that a mod belongs to. Useful for the preview UI to
 * show "(Sound)" badges next to entries.
 */
export function groupForCategories(
  categories: readonly string[],
): LoadOrderGroup {
  const priority = priorityForCategories(categories);
  return (
    LOAD_ORDER_GROUPS.find((g) => g.priority === priority) ??
    LOAD_ORDER_GROUPS.find((g) => g.id === "other")!
  );
}
