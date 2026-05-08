//! Tauri-managed cache of parsed save data.
//!
//! `get_save_data` previously decoded a multi-megabyte `game.sii` on every
//! call, including each post-mutation refetch. The cache key is the save's
//! directory path; the freshness key is `game.sii`'s mtime. A change made by
//! the game (or another tool) bumps the mtime, so the next read re-parses
//! transparently.
//!
//! Mutation commands invoke `refresh` after a successful write so subsequent
//! reads hit the cache without re-parsing — and so the in-memory snapshot
//! always reflects the freshly-written file.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use crate::error::AppError;
use crate::save::models::SaveData;
use crate::save::reader::read_save;

#[derive(Default)]
pub struct SaveCache {
    inner: Mutex<HashMap<PathBuf, CacheEntry>>,
}

struct CacheEntry {
    mtime: SystemTime,
    data: Arc<SaveData>,
}

impl SaveCache {
    /// Return cached data if `game.sii`'s mtime matches the cached entry,
    /// otherwise read + parse fresh. Stat happens on every call — this is
    /// orders of magnitude cheaper than the parse and protects against
    /// out-of-band edits.
    pub fn get(&self, save_path: &str) -> Result<Arc<SaveData>, AppError> {
        let key = PathBuf::from(save_path);
        let mtime = save_mtime(&key)?;

        if let Some(hit) = self.lookup(&key, mtime) {
            return Ok(hit);
        }

        let data = Arc::new(read_save(save_path)?);
        self.store(key, mtime, data.clone());
        Ok(data)
    }

    /// Re-read after a successful write so the next `get` is a cache hit and
    /// every mutation returns an up-to-date snapshot.
    pub fn refresh(&self, save_path: &str) -> Result<Arc<SaveData>, AppError> {
        let key = PathBuf::from(save_path);
        let mtime = save_mtime(&key)?;
        let data = Arc::new(read_save(save_path)?);
        self.store(key, mtime, data.clone());
        Ok(data)
    }

    fn lookup(&self, key: &PathBuf, mtime: SystemTime) -> Option<Arc<SaveData>> {
        let guard = self.inner.lock().ok()?;
        let entry = guard.get(key)?;
        if entry.mtime == mtime {
            Some(entry.data.clone())
        } else {
            None
        }
    }

    fn store(&self, key: PathBuf, mtime: SystemTime, data: Arc<SaveData>) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.insert(key, CacheEntry { mtime, data });
        }
    }
}

fn save_mtime(save_dir: &Path) -> Result<SystemTime, AppError> {
    let game_sii = save_dir.join("game.sii");
    let meta = std::fs::metadata(&game_sii)?;
    Ok(meta.modified()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::thread::sleep;
    use std::time::Duration;

    const SAMPLE: &str = r#"SiiNunit
{
economy : .economy {
 player: player.1
 bank: bank.1
 companies: 0
}
player : player.1 {
 assigned_truck: null
 assigned_trailer: null
 assigned_trailer_connected: false
}
bank : bank.1 {
 money_account: 100
 loans: 0
 overdraft: false
}
}
"#;

    fn write_sample(dir: &std::path::Path, money: i64) {
        let body = SAMPLE.replace("money_account: 100", &format!("money_account: {money}"));
        fs::write(dir.join("game.sii"), body).unwrap();
    }

    #[test]
    fn cache_returns_same_arc_when_mtime_unchanged() {
        let tmp = tempfile::tempdir().unwrap();
        write_sample(tmp.path(), 100);
        let path = tmp.path().to_string_lossy().to_string();

        let cache = SaveCache::default();
        let a = cache.get(&path).unwrap();
        let b = cache.get(&path).unwrap();
        assert!(Arc::ptr_eq(&a, &b), "cache hit should return identical Arc");
        assert_eq!(a.bank.money_account, 100);
    }

    #[test]
    fn cache_misses_when_mtime_changes() {
        let tmp = tempfile::tempdir().unwrap();
        write_sample(tmp.path(), 100);
        let path = tmp.path().to_string_lossy().to_string();

        let cache = SaveCache::default();
        let a = cache.get(&path).unwrap();
        // mtime granularity on some filesystems is 1s — sleep long enough.
        sleep(Duration::from_millis(1100));
        write_sample(tmp.path(), 999);

        let b = cache.get(&path).unwrap();
        assert!(!Arc::ptr_eq(&a, &b), "mtime change should miss");
        assert_eq!(b.bank.money_account, 999);
    }

    #[test]
    fn refresh_updates_entry() {
        let tmp = tempfile::tempdir().unwrap();
        write_sample(tmp.path(), 100);
        let path = tmp.path().to_string_lossy().to_string();

        let cache = SaveCache::default();
        let _ = cache.get(&path).unwrap();
        sleep(Duration::from_millis(1100));
        write_sample(tmp.path(), 555);

        let refreshed = cache.refresh(&path).unwrap();
        assert_eq!(refreshed.bank.money_account, 555);

        let next = cache.get(&path).unwrap();
        assert!(Arc::ptr_eq(&refreshed, &next), "post-refresh get is a hit");
    }
}
