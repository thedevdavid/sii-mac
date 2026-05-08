# sii-mac

## 1.3.1

### Patch Changes

- ## Build & release

  - **CI workflow** (`.github/workflows/ci.yml`) — runs on every PR and push to main. Type-check, Rust fmt check, `cargo clippy --all-targets -- -D warnings`, `cargo test --lib`, and `bun run build` all gate the merge.
  - **Multi-platform release workflow** (`.github/workflows/release.yml`) — replaces the Windows-only `windows-build.yml`. Triggers when `package.json` changes on main, creates a `vX.Y.Z` tag if missing, then runs `tauri-apps/tauri-action@v0` in a matrix for macOS (Apple Silicon + Intel), Linux (Ubuntu 22.04), and Windows. Bun-based, with Cargo registry/target caching per platform.
  - **Route-level code-splitting.** `TanStackRouterVite({ autoCodeSplitting: true })` produces a separate chunk per route. Main bundle dropped from 1.27 MB → 678 KB; route bundles are 8–28 KB each.
  - **`check:all` script** — single entry point combining `type-check`, `rust:format:check`, `rust:lint`, `rust:test`, and `build`. Same script the CI calls, so local "is this branch shippable" matches CI exactly.
  - **Cleanup** — fixed several pre-existing clippy lints (`&PathBuf` → `&Path`, redundant closure on `ok_or_else`, `.iter().copied().collect()` → `.to_vec()`, doc-comment indentation) so `cargo clippy -- -D warnings` is now green.

## 1.3.0

### Minor Changes

- ## Save editor

  - **Restore from backup.** New "Restore" button in the save editor header opens a dialog showing the rotating `.bak` (last edit) and sticky `.bak.original` (pre-first-edit) snapshots the writer captures via `atomic_replace_verified`. Restoring rotates the live `game.sii` into `.bak` first so the restore is itself reversible. Backed by `list_save_backups` / `restore_save_backup` Rust commands.
  - **Wheel & tire wear is now editable.** Truck condition badges, the "Repair All" / per-truck repair flows, and the truck detail sheet now include `wheels_wear` — matching what the in-game service screen actually checks. Setting a uniform value spreads it across every `wheels_wear[i]` slot in the save.
  - **License plate display.** Trucks/trailers tables strip the `<color value=…>` SCS markup and split the trailing `|state` suffix; renders the plate as monospace text with a subtle state label instead of the raw `<color value=FF650000>CP19679|california` blob.
  - **Garage city names.** SCS truncates city tokens to 12 base-37 chars (`san_francisc`, `coeur_d_alen`, etc.). `getCityInfo` now falls back to a 12-char prefix index of `ATS_CITIES`, so the world-editor table no longer shows half-typed names with `Unknown` states.
  - **Save-format setting fixed.** The Settings dropdown was offering "Binary (Default)" and a bogus `1=Plaintext`. Real ATS values: `0` = ScsC encrypted (default), `2` = SiiNunit plaintext. The description now also explains that our editor always writes plaintext regardless of this setting and the game re-encrypts on its next save.
  - **`verify_save_text_lossless` diagnostic test.** New strict text-level round-trip test (parse → serialize → byte-compare against the original) that dumps both halves to `/tmp/sii_*.txt` and prints the first drifting line on mismatch. The existing `verify_save_lossless_roundtrip` only checked self-consistency; this one catches the case where the parser silently transforms a value type.

  ## Profile backups

  - **Delete buttons.** Each backup row now has a destructive trash icon next to Restore. Backed by a new `delete_backup` Rust command that refuses to remove anything missing the `.backup_metadata.json` marker so a mistyped path can't nuke an unrelated directory.
  - **Auto-cleanup retention.** New Settings → Backups group: pick "Keep all / 3 / 5 / 10 / 20 newest", and after every successful backup creation the policy runs automatically (per-profile, newest-first). A manual "Clean up now" button applies the same policy on demand. Backed by a new `cleanup_backups(keep_per_profile)` command and a localStorage-backed `useBackupRetention` hook.
  - **Restore actually replaces the same profile.** The Restore dialog used to say "creates a new profile, fails if same name exists" — confusing when you literally want to roll back to your backup. The dialog now says "This replaces the on-disk profile … your current state will be moved aside as `<name>.replaced-<timestamp>` so you can roll back manually." Backend takes a new `overwrite: bool`; with overwrite=true, the existing profile is renamed to `<name>.replaced-<UTC ts>` (rolled back if staging fails afterwards) instead of erroring with `AlreadyExists`.
  - **Reveal-in-Finder is its own button.** The whole backup row used to be a click target for `revealInFinder`, which meant clicking Restore opened both the dialog and Finder. Reveal is now a standalone ghost icon button in `ItemActions` next to Restore + Delete, and the row click handler is gone.

  ## Settings

  - **Real version display.** Both the sidebar footer ("SII Mac vX.Y.Z") and the Settings → Updates "Current version" line now read from `getVersion()` instead of the hardcoded `v1.0.0`.
  - **Open `config.cfg`.** New "Open config.cfg" item in the Game Config group calls `openPath` on the path the backend already returns, opening it in the system default editor for advanced settings not exposed in the UI. Adds `opener:allow-open-path` to the default capability.

  ## UI / interaction fixes

  - **Cursor leak.** The `cursor: text` rule on `[data-slot="content"]` and `[data-slot="scroll-area-viewport"]` was bleeding the I-beam into table-row whitespace, toolbar gaps, and around the source/category buttons in the mod library. Narrowed to actual text-input elements (`textarea`, `input`, `[contenteditable]`) — those containers keep `user-select: text` for normal selection but use the default cursor.
  - **Theme toggle no longer floats.** Adding `relative` to the `ModeToggle` trigger button anchors the absolutely-positioned moon icon inside the button instead of inheriting positioning from a transformed ancestor up the tree.
  - **Recommended load-order is a dialog.** Converted the popover to a Cupertino dialog with internal scroll so the long ordered list stays scannable on small windows where the popover was clipping.

  ## Developer ergonomics

  - **`TruckChanges.wheels_wear`** new optional field on the Rust changes struct + Zod payload. `update_truck` applies it uniformly to every `wheels_wear[i]` via the new `set_indexed_fields` helper (extracted from `zero_indexed_fields`).
  - **`SafeIntSchema` use** preserved at the mutation boundary so the renderer can't silently send a > 2⁵³ XP value the writer would mishandle.
  - **Save format strategy** documented in `CLAUDE.md` already; the dropdown copy now matches.

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
