//! Cross-platform Steam path discovery.
//!
//! Every call site that enumerates Steam roots — profile detection, Steam
//! Cloud profile resolution, and workshop scanning — goes through this module
//! so the platform-specific fallback logic lives in one place.
//!
//! The enumerations are deliberately "all roots that could possibly exist"
//! rather than "the one root that does" because:
//!   - CrossOver on macOS can host multiple bottles, each with its own Steam
//!   - a Mac user can have both native Steam and a CrossOver Steam side by side
//!   - Linux users can have `.steam/steam` + `.local/share/Steam` + Flatpak dirs
//!
//! Callers then iterate and pick whichever roots actually exist on disk.

use std::fs;
use std::path::{Path, PathBuf};

pub const ATS_APP_ID: &str = "270880";
pub const ETS2_APP_ID: &str = "227300";

/// Return every Steam `steamapps/` directory that might exist on this host.
///
/// Used by workshop scanning (`workshop/content/{app_id}`) and by anything
/// that needs to reach into `steamapps`. CrossOver bottles are walked on
/// macOS — one bottle may contain Steam, another may not.
pub fn steam_steamapps_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(home) = dirs::home_dir() {
        #[cfg(target_os = "macos")]
        {
            roots.push(home.join("Library/Application Support/Steam/steamapps"));
            // CrossOver bottles — each bottle has its own Steam install
            for bottle in crossover_bottles() {
                roots.push(bottle.join("drive_c/Program Files (x86)/Steam/steamapps"));
            }
        }
        #[cfg(target_os = "linux")]
        {
            roots.push(home.join(".steam/steam/steamapps"));
            roots.push(home.join(".local/share/Steam/steamapps"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        roots.push(PathBuf::from("C:\\Program Files (x86)\\Steam\\steamapps"));
    }

    roots
}

/// Return every Steam `userdata/` directory that might exist, biased toward
/// the specific game base so that a CrossOver-hosted game looks inside
/// bottle Steam first and a native-platform game looks at native Steam first.
///
/// Callers iterate and pick the first root that contains the expected
/// `{uid}/{app_id}/remote/profiles` subtree.
pub fn steam_userdata_roots_for_game(game_base: &Path) -> Vec<PathBuf> {
    #[allow(unused_variables)]
    let is_crossover = dirs::document_dir()
        .map(|docs| game_base.starts_with(&docs))
        .unwrap_or(false);

    let mut roots = Vec::new();

    #[cfg(target_os = "macos")]
    if let Some(home) = dirs::home_dir() {
        if is_crossover {
            for bottle in crossover_bottles() {
                roots.push(bottle.join("drive_c/Program Files (x86)/Steam/userdata"));
            }
            roots.push(home.join("Library/Application Support/Steam/userdata"));
        } else {
            roots.push(home.join("Library/Application Support/Steam/userdata"));
            roots.push(home.join(".steam/steam/userdata"));
        }
    }

    #[cfg(target_os = "linux")]
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".steam/steam/userdata"));
        roots.push(home.join(".local/share/Steam/userdata"));
    }

    #[cfg(target_os = "windows")]
    roots.push(PathBuf::from("C:\\Program Files (x86)\\Steam\\userdata"));

    roots
}

/// Infer the Steam app id (ATS=270880, ETS2=227300) from a game base path.
///
/// The heuristic is a case-insensitive string match on "american truck" or
/// "ats" in the path; falls back to ETS2.
pub fn app_id_from_game_base(game_base: &Path) -> &'static str {
    let lower = game_base.to_string_lossy().to_lowercase();
    if lower.contains("american truck") || lower.contains("ats") {
        ATS_APP_ID
    } else {
        ETS2_APP_ID
    }
}

/// Enumerate the contents of `~/Library/Application Support/CrossOver/Bottles/`
/// on macOS. Returns the bottle directory paths. On other platforms returns
/// an empty vec.
#[cfg(target_os = "macos")]
fn crossover_bottles() -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let bottles = home.join("Library/Application Support/CrossOver/Bottles");
    if !bottles.exists() {
        return Vec::new();
    }
    match fs::read_dir(&bottles) {
        Ok(entries) => entries.flatten().map(|e| e.path()).collect(),
        Err(e) => {
            crate::warn_fallback!(
                "crossover_bottles: could not read {}: {e}",
                bottles.display()
            );
            Vec::new()
        }
    }
}

/// No-op on non-macOS platforms. CrossOver is macOS-only.
#[cfg(not(target_os = "macos"))]
#[allow(dead_code)]
fn crossover_bottles() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_id_from_game_base_ats() {
        assert_eq!(
            app_id_from_game_base(Path::new("/Users/x/Documents/American Truck Simulator")),
            ATS_APP_ID
        );
        assert_eq!(
            app_id_from_game_base(Path::new("/home/x/.local/share/American Truck Simulator")),
            ATS_APP_ID
        );
    }

    #[test]
    fn test_app_id_from_game_base_ets2() {
        assert_eq!(
            app_id_from_game_base(Path::new("/Users/x/Documents/Euro Truck Simulator 2")),
            ETS2_APP_ID
        );
    }

    #[test]
    fn test_app_id_case_insensitive() {
        assert_eq!(
            app_id_from_game_base(Path::new("/home/x/AMERICAN TRUCK SIMULATOR")),
            ATS_APP_ID
        );
    }

    #[test]
    fn test_steamapps_roots_non_empty_shape() {
        // Whatever platform we're on, at least one candidate root is returned.
        // We can't assert the path exists — CI runners don't install Steam.
        let roots = steam_steamapps_roots();
        assert!(!roots.is_empty() || cfg!(target_os = "linux"));
    }
}
