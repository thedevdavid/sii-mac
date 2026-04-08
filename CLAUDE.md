# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SII Mac is a macOS desktop app for managing American Truck Simulator (ATS) and Euro Truck Simulator 2 (ETS2) profiles. Built with Tauri 2 (Rust backend) + React 19 + Vite + TypeScript frontend.

The app detects game installations on macOS, reads/decodes SII save files (binary/encrypted format used by SCS games), and provides profile management: viewing, cloning, renaming, deleting, backup/restore.

## Commands

- `npm run tauri dev` — Run the full app in development (starts Vite dev server + Rust backend)
- `npm run tauri build` — Production build (creates macOS .app bundle)
- `npm run dev` — Vite dev server only (frontend, no Tauri backend)
- `npm run build` — TypeScript check + Vite build (frontend only)
- `cd src-tauri && cargo check` — Check Rust code without building
- `cd src-tauri && cargo build` — Build Rust backend only

No test runner or linter is currently configured.

## Architecture

### Backend (Rust — `src-tauri/`)

- **`src/lib.rs`** — Tauri app entry point, registers all plugins and Tauri commands
- **`src/commands/`** — Tauri command handlers exposed to frontend via `invoke()`. Three modules: `profiles`, `saves`, `backup`
- **`src/profile/`** — Core profile logic: `detection` (finds game install paths on macOS), `models` (data structures), `manager` (CRUD operations on profiles)
- **`src/sii/`** — SII file decoder using `sii-decode-rs` crate. Parses the binary/encrypted save format into plaintext, with field extraction utilities
- **`src/error.rs`** — `AppError` enum with `thiserror` + custom `Serialize` impl (serializes as `{kind, message}` for frontend consumption)

### Frontend (React — `src/`)

- **`src/App.tsx`** — Root component. Manual view routing via `activeView` state (no router). Wraps app in `QueryClientProvider`, `SidebarProvider`, `TooltipProvider`
- **`src/lib/tauri-commands.ts`** — Typed wrappers around `invoke()` calls to Rust commands. This is the sole bridge between frontend and backend
- **`src/lib/types.ts`** — TypeScript types mirroring Rust structs (`GameInstallation`, `ProfileSummary`, `ProfileDetail`, etc.)
- **`src/features/profiles/`** — Feature components: `profile-overview`, `profile-saves`, `profile-clone`, `profile-backups`
- **`src/hooks/`** — TanStack Query hooks (`use-game-detection`, `use-profiles`)
- **`src/components/ui/`** — shadcn/ui components (Tailwind CSS v4)

### Key Patterns

- Frontend-backend communication: all calls go through `src/lib/tauri-commands.ts` → Tauri `invoke()` → Rust command handlers in `src-tauri/src/commands/`
- Rust errors serialize to `{kind: string, message: string}` — frontend can pattern-match on `kind`
- Path alias `@/` maps to `./src/` (configured in both vite.config.ts and tsconfig.json)
- State management: TanStack React Query for server state, React state for UI state
- UI: shadcn/ui components with Radix primitives, Tailwind CSS v4, Geist font
