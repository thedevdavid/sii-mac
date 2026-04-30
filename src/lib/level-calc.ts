/**
 * ATS/ETS2 level calculation from experience points.
 * The level is determined by a cumulative XP threshold table from economy_data.sii.
 * ATS and ETS2 have DIFFERENT tables. After index 29, the last value repeats forever.
 * Source: TS-SE-Tool FormMethods.cs + Truck Simulator Wiki
 */

/** ATS XP required per level (30 defined, then repeats 7300) */
const ATS_LEVEL_XP = [
  200, 500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100,
  2300, 2500, 2700, 2900, 3100, 3300, 3500, 3700, 4000, 4300,
  4600, 4900, 5200, 5500, 5800, 6100, 6400, 6700, 7000, 7300,
];

/** ETS2 XP required per level (30 defined, then repeats 6800) */
const ETS2_LEVEL_XP = [
  200, 500, 700, 900, 1000, 1100, 1300, 1600, 1700, 2100,
  2300, 2600, 2700, 2900, 3000, 3100, 3400, 3700, 4000, 4300,
  4600, 4700, 4900, 5200, 5700, 5900, 6000, 6200, 6600, 6800,
];

/**
 * Calculate level from total XP.
 * @param xp Total experience points
 * @param game "ats" or "ets2"
 * @returns { level, xpForCurrentLevel, xpForNextLevel, currentLevelXp }
 */
export function calculateLevel(
  xp: number,
  game: "ats" | "ets2" = "ats",
): {
  level: number;
  progress: number;
  xpIntoLevel: number;
  xpNeededForNext: number;
} {
  const table = game === "ets2" ? ETS2_LEVEL_XP : ATS_LEVEL_XP;
  const repeatValue = table[table.length - 1];

  let remaining = xp;
  let level = 0;

  // Walk through the table
  for (let i = 0; i < table.length; i++) {
    if (remaining < table[i]) {
      return {
        level,
        progress: remaining / table[i],
        xpIntoLevel: remaining,
        xpNeededForNext: table[i],
      };
    }
    remaining -= table[i];
    level++;
  }

  // After table exhaustion, each level costs repeatValue
  const extraLevels = Math.floor(remaining / repeatValue);
  level += extraLevels;
  remaining -= extraLevels * repeatValue;

  return {
    level,
    progress: remaining / repeatValue,
    xpIntoLevel: remaining,
    xpNeededForNext: repeatValue,
  };
}
