# sii-mac

## 1.2.0

### Minor Changes

- ## Save editor
  - **Critical: backup is no longer overwritten on every save.** `atomic_replace_verified` now writes a sticky `<file>.bak.original` on the very first edit and never overwrites it, alongside a rotating `<file>.bak` for "undo last." Two consecutive edits no longer destroy the true pre-edit state.
  - **Critical: writer correctness for binary saves.** Hex floats (`&XXXXXXXX`), integer-valued vectors `(0, 0, 0)`, and placement components now round-trip byte-exact through the SiiNunit serializer. Confirmed against a real 17,363-object / 199,001-field game save.
  - New ignored test `verify_save_lossless_roundtrip` walks any `SII_ROUNDTRIP_FILE=<path>` save through decode → parse → serialize → re-parse and asserts every field byte-exact, panicking on the first drift.
  - Save data now reports `fileFormat` (`plaintext` / `encrypted` / `binaryBsii` / `obfuscated3nK`) for diagnostics.

  ## Playset editor
  - **Critical: refuse to apply an empty playset** to a profile (`apply_playset` returns an error instead of silently writing `[]` to `profile.sii`).
  - **Critical: refuse to wipe a curated playset with empty live state** (`accept_playset_drift` rejects when the playset has entries and the live profile has none).
  - **Idempotent add/remove.** `add_mod_to_playset` and `remove_mod_from_playset` are now no-ops when the desired end state already holds, eliminating the spurious "already in playset" / "not in playset" toasts during optimistic-cache races.
  - **Optimistic deletion** in the sidebar — deleted playsets disappear instantly, then reconcile with the server.
  - **Right-click context menu** on each playset row in the sidebar (rename, duplicate, export, delete).
  - **⋮ menu no longer activates the playset** — restructured the row so only the body is clickable.
  - **Drift banner simplified to one button.** The redundant "Re-apply playset" was dropped (the header's `Apply` already does that). The opposite-direction action is the only banner button now.

  ## Mod-library / playset-editor UX
  - **Multi-select + bulk actions on playset entries.** Hover-revealed checkbox per row; floating selection toolbar with Enable / Disable / Lock / Unlock / Move-to-top / Move-to-bottom / Remove / Select-all / Clear.
  - **Move to top / Move to bottom** added to each entry's ⋮ menu, alongside the existing Move up / Move down.
  - **Mod-library refresh** is now a labeled `Rescan` button (was an easy-to-miss icon).
  - **Mod row density** loosened — drag handle + switch + name + ⋮ menu (was 8 controls); meta line collapsed to `author · vX`; info button hover-revealed.
  - **Playset-editor row density** — secondary actions (lock/up/down/remove) moved into the ⋮ menu; row keeps drag, multi-select checkbox, switch, name, ⋮.

  ## Load-order recommendations
  - Rewrote `LOAD_ORDER_GROUPS` to follow the canonical Steam community guide (`https://steamcommunity.com/sharedfiles/filedetails/?id=3147291492`). New top-to-bottom: UI · Sounds · Tuning/Interiors · Paint jobs · Trucks · Trailers · AI/Traffic · Graphics & Weather · Economy/Physics · World models · Maps · Other. The change flows through both the info popover and `analyzeAndReorder` (Auto-fix order).

  ## Steam Cloud / CrossOver
  - `detect_game_from_path` now recognizes the Steam AppID segment (`270880` = ATS, `227300` = ETS2) so `userdata/<userId>/<appId>/remote/profiles/...` paths resolve without the `no game marker` fallback warning.

  ## Component / styling fixes
  - Popover content now uses the same macOS-style frosted-glass treatment (`bg-popover/90` + `backdrop-blur-2xl backdrop-saturate-150`) as DropdownMenu / ContextMenu / Combobox / Menubar, instead of being a flat opaque box.
  - All raw `<input type="checkbox">`, `<label>`, and `<textarea>` elements in feature/route code replaced with the design-system `Checkbox` (cupertino), `Label` (ui), and `Textarea` (cupertino).

  ## Mod scanner — auto-categorization
  - Mods whose `manifest.sii` ships without `category[]` (most older / hand-packed local mods) now have categories inferred from `description.txt`, the display name, and the archive/dir name. Maps onto SCS canonical category values so the inferred mods sort identically to manifest-tagged ones in auto-fix.

  ## Playset editor — group lock
  - New `lock_group` field on `PlaysetEntry` (Rust + Zod). Entries sharing the same group id stay contiguous in their original relative order during auto-fix, but the cluster as a whole is free to move. A locked entry within a group dissolves grouping for that run (lock takes precedence).
  - New backend command `set_entries_lock_group` plus matching `useSetEntriesLockGroup` hook with optimistic update.
  - Multi-select toolbar gained 🔗 (Group) and 🔗⃠ (Ungroup) buttons. Group requires ≥2 selected; disabled when all selected already share the same group.
  - Each grouped row shows a deterministic HSL color dot derived from the group id so cluster members are visually associated at a glance.
  - `analyzeAndReorder` post-processes its output through `applyLockGroups` so both legacy and recipe-based auto-fix respect groups.
  - Tests in `load-order.test.ts` cover contiguity preservation, lock-overrides-group precedence, and no-op behavior when no groups exist.
