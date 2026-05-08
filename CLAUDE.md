# CLAUDE.md

## Project Overview

SII Mac is a cross-platform desktop app for managing American Truck Simulator (ATS) and Euro Truck Simulator 2 (ETS2) profiles and save files. Built with Tauri 2 (Rust backend) + React 19 + Vite + TypeScript frontend.

Features: game detection (macOS/Windows/Linux/CrossOver/Steam Cloud), profile viewing/cloning/renaming/deleting, save editing (money, trucks, trailers, garages), mod management, backup/restore, game config editing, profile comparison, auto-updater.

## Commands

- `bun tauri dev` — Full app (Vite + Rust)
- `bun tauri build` — Production build
- `bun dev` — Vite dev server only
- `bun run build` — TypeScript check + Vite build
- `cd src-tauri && cargo check` — Check Rust
- `cd src-tauri && cargo test --lib` — Run Rust tests

## Architecture

### Backend (Rust — `src-tauri/src/`)

- **`lib.rs`** — Tauri entry, registers plugins (fs, dialog, os, process, store, updater) and ~20 commands
- **`commands/`** — 5 modules: `profiles` (detect, list, clone, rename, delete, scan mods), `saves` (list), `editor` (get/update trucks/trailers/garages/player), `backup` (create/list/restore), `config` (game settings)
- **`sii/`** — SII file processing: `extract.rs` (legacy field extraction), `parser.rs` (SIIN → SiiDocument tree), `writer.rs` (SiiDocument → SIIN text), `types.rs` (SiiDocument, SiiObject, SiiValue)
- **`save/`** — Save editing: `models.rs` (SaveData, TruckData, etc.), `reader.rs` (game.sii → SaveData), `writer.rs` (apply edits + write back)
- **`profile/`** — Profile management: `detection.rs` (cross-platform game paths), `manager.rs` (CRUD + Steam Cloud), `cloner.rs` (parser-based patching), `scanner.rs` (content tree), `metadata.rs` (profile.sii fields), `mod_scanner.rs` (filesystem mod scan + manifest parsing), `models.rs`
- **`utils.rs`** — Shared: format_modified_time, dir_size, copy_dir, prettify_save_dir
- **`error.rs`** — AppError enum serialized as `{kind, message}` for frontend

### Frontend (React 19 — `src/`)

- **Routing**: TanStack Router v1, file-based routes in `src/routes/` (overview, saves, mods, clone, compare, backups, settings, editor.$saveId)
- **State**: `ProfileContext` (`src/lib/profile-context.tsx`) for selected profile/installation. TanStack Query for server state. No global store.
- **Query**: Centralized key factory (`src/lib/query-keys.ts`). Mutation hooks (`src/hooks/use-mutations.ts`) with automatic invalidation.
- **Components**: `cupertino/` (macOS-styled wrappers) + `ui/` (shadcn/Base UI components). DataTable + DataTableToolbar + DataTableFacetedFilter for data grids.
- **Features**: `src/features/editor/` (save editor tabs), `src/features/profiles/` (overview, saves, mods, clone, compare, backups)

### Save format strategy

ATS/ETS2 stores `game.sii` in one of four formats: plaintext SiiNunit, encrypted ScsC (AES-256-CBC + zlib + HMAC), binary BSII, or obfuscated 3nK (XOR). Our reader (`src-tauri/src/sii/mod.rs::detect_format` + `decode_sii_file`) accepts all four.

**Our writer always emits plaintext SiiN, regardless of source format.** This is deliberate and matches the working reference editor `CoffeSiberian/truck-tools` (Tauri+Rust+React, same stack). ATS accepts plaintext on load (`g_save_format=2` in `config.cfg` makes the game itself emit plaintext) and re-encrypts back to the user's configured native format on its next in-game save. The temporary on-disk size jump (e.g. 530 KB ScsC → 6 MB SiiN) lasts only until the game's next autosave.

We do not ship a ScsC encryptor or a BSII writer. Neither does any public Rust crate today (`sii-decode-rs`, `decrypt_truck`, and `TheLazyTomcat/SII_Decrypt` are all decode-only). ScsC re-encryption is buildable but non-trivial (public AES key + HMAC + zlib pipeline); BSII has no public spec. Plaintext output sidesteps both.

**`info.sii` is never touched.** The game owns it and rewrites it atomically alongside `game.sii` on its next save. `truck-tools` follows the same rule. Our writer (`src-tauri/src/save/writer.rs::write_save`) only writes `game.sii` and the rotating `.bak` / sticky `.bak.original` (see `crate::utils::atomic_replace_verified`).

A non-ignored regression test (`test_writer_always_emits_plaintext_siin_and_does_not_touch_info_sii` in `save/writer.rs`) locks in both invariants — output begins with `SiiNunit` magic, info.sii bytes + mtime are unchanged.

### Key Patterns

- Frontend ↔ backend: `src/lib/tauri-commands.ts` → Tauri `invoke()` → Rust commands. All responses validated with Zod.
- Mutations: `useMutation` hooks in `use-mutations.ts` with automatic `queryKeys` invalidation and toast notifications.
- Data tables: `DataTable` component with pagination, column visibility, global filter, faceted filters. All tables use `DataTableToolbar`.
- Forms: TanStack Form + Zod schemas.
- Path alias: `@/` → `./src/`
- UI: shadcn/ui with Base UI primitives (`@base-ui/react`), Tailwind CSS v4, @tabler/icons-react
- Platform config: `tauri.macos.conf.json` / `tauri.windows.conf.json` for OS-specific settings
