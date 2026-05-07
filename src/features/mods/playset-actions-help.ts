export const playsetActionHelp = {
  apply:
    "Write this playset's enabled mods into the active profile's profile.sii. The game will load these mods (in order) on next launch.",
  saveAs:
    "Promote a temporary playset to a saved one. Saved playsets persist between sessions and can be re-applied later.",
  acceptDrift:
    "Pull the game's current active mods back into this playset. Use this if you enabled mods in-game and want to keep them tied to this playset.",
  revertDrift:
    "Re-apply this playset, overwriting whatever the game currently has set.",
  autoFix:
    "Reorder mods using their declared compatibility hints. Locked entries stay where they are.",
} as const;
