//! Playset management: named mod collections with load order, drift tracking,
//! import/export, and per-profile "active playset" bindings.
//!
//! Design inspired by the CS1-era Skyve mod manager. A playset is the single
//! source of truth for a profile's `active_mods`; editing a playset never
//! touches `profile.sii` until the user applies it.

pub mod drift;
pub mod io;
pub mod manager;
pub mod models;
pub mod store;
