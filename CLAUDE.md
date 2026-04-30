# CLAUDE.md

## Project Overview

SII Mac is a cross-platform desktop app for managing American Truck Simulator (ATS) and Euro Truck Simulator 2 (ETS2) profiles and save files. Built with Tauri 2 (Rust backend) + React 19 + Vite + TypeScript frontend.

Features: game detection (macOS/Windows/Linux/CrossOver/Steam Cloud), profile viewing/cloning/renaming/deleting, save editing (money, trucks, trailers, garages), mod management, backup/restore, game config editing, profile comparison, auto-updater.

## Commands

- `npm run tauri dev` — Full app (Vite + Rust)
- `npm run tauri build` — Production build
- `npm run dev` — Vite dev server only
- `npm run build` — TypeScript check + Vite build
- `cd src-tauri && cargo check` — Check Rust
- `cd src-tauri && cargo test --lib` — Run Rust tests (72 pass, 3 ignored)

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

### Key Patterns

- Frontend ↔ backend: `src/lib/tauri-commands.ts` → Tauri `invoke()` → Rust commands. All responses validated with Zod.
- Mutations: `useMutation` hooks in `use-mutations.ts` with automatic `queryKeys` invalidation and toast notifications.
- Data tables: `DataTable` component with pagination, column visibility, global filter, faceted filters. All tables use `DataTableToolbar`.
- Forms: TanStack Form + Zod schemas.
- Path alias: `@/` → `./src/`
- UI: shadcn/ui with Base UI primitives (`@base-ui/react`), Tailwind CSS v4, @tabler/icons-react
- Platform config: `tauri.macos.conf.json` / `tauri.windows.conf.json` for OS-specific settings
