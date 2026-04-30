//! Shared filesystem, formatting, and save display utilities.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::error::AppError;
use crate::sii;

/// Log a non-fatal warning to stderr with a consistent `[warn]` prefix.
///
/// Use this at any silent-fallback site where the code has decided to
/// continue with a default value instead of propagating the error. The
/// warning is visible during `tauri dev` and in production crash logs, so a
/// user hitting an edge case can tell the developer what happened.
///
/// This is a temporary shim until Phase 6 lands a structured logger
/// (`tauri-plugin-log` / `tracing`). Keep call sites grep-able via `warn_fallback`.
#[macro_export]
macro_rules! warn_fallback {
    ($($arg:tt)*) => {{
        eprintln!("[warn] {}", format_args!($($arg)*));
    }};
}

/// Atomically replace `target` with `content`.
///
/// Steps: write to a sibling `.tmp` file, fsync the file, run `verify` against
/// the tmp contents, copy the live target to `backup` (when both exist), then
/// atomic-rename the tmp over `target`. On any failure the tmp file is removed
/// and the live target is left untouched.
///
/// Why: `fs::write` is not atomic — a partial write or a crash mid-flush can
/// leave both the live file and a newly-created backup in an inconsistent state.
/// This helper narrows the window where the target is in a bad state to a single
/// `rename` syscall, and guarantees the new content is structurally valid
/// (`verify` passed) before the live file changes.
pub fn atomic_replace_verified<V>(
    target: &Path,
    backup: Option<&Path>,
    content: &[u8],
    verify: V,
) -> Result<(), AppError>
where
    V: FnOnce(&str) -> Result<(), AppError>,
{
    let tmp = tmp_sibling(target)?;

    let result = (|| -> Result<(), AppError> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(content)?;
        f.sync_all()?;
        drop(f);

        let verify_text = fs::read_to_string(&tmp)?;
        verify(&verify_text)?;

        if let Some(backup_path) = backup {
            if target.exists() {
                fs::copy(target, backup_path)?;
            }
        }
        fs::rename(&tmp, target)?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn tmp_sibling(target: &Path) -> Result<PathBuf, AppError> {
    let file_name = target.file_name().ok_or_else(|| {
        AppError::InvalidPath(format!("target has no filename: {}", target.display()))
    })?;
    let mut tmp_name = file_name.to_os_string();
    tmp_name.push(".tmp");
    Ok(target.with_file_name(tmp_name))
}

/// Format a file/directory's modified time as an RFC 3339 string.
///
/// Matches the timestamp format used elsewhere in the app (backup metadata,
/// etc.) and the frontend `TimestampSchema` parser. Returns `None` if metadata
/// can't be read or the timestamp is unrepresentable (pre-1970 due to clock
/// drift). Logs a warning on failure so a suspicious "never modified" entry in
/// the UI is traceable.
pub fn format_modified_time(path: &Path) -> Option<String> {
    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(e) => {
            crate::warn_fallback!(
                "format_modified_time: metadata read failed for {}: {e}",
                path.display()
            );
            return None;
        }
    };
    let modified = match metadata.modified() {
        Ok(t) => t,
        Err(e) => {
            crate::warn_fallback!(
                "format_modified_time: mtime unavailable for {}: {e}",
                path.display()
            );
            return None;
        }
    };
    let duration = modified.duration_since(SystemTime::UNIX_EPOCH).ok()?;
    chrono::DateTime::from_timestamp(duration.as_secs() as i64, 0).map(|dt| dt.to_rfc3339())
}

/// Recursively calculate directory size in bytes.
///
/// Any unreadable subdirectory is skipped but logged via `warn_fallback!`
/// so a partially-computed size is visible instead of silently collapsing
/// to zero.
pub fn dir_size_recursive(path: &Path) -> u64 {
    let mut total: u64 = 0;
    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(e) => {
            crate::warn_fallback!("dir_size_recursive: could not read {}: {e}", path.display());
            return 0;
        }
    };
    for entry in entries.flatten() {
        if let Ok(meta) = entry.metadata() {
            if meta.is_file() {
                total += meta.len();
            } else if meta.is_dir() {
                total += dir_size_recursive(&entry.path());
            }
        }
    }
    total
}

/// Recursively copy a directory and all its contents.
pub fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), AppError> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Count every file under a directory tree (recursively). Used by the
/// streaming copy helper so progress events can report a meaningful
/// `current / total` ratio. Returns `0` on unreadable directories — the
/// caller can treat that as indeterminate progress.
pub fn count_files_recursive(path: &Path) -> u64 {
    let mut total: u64 = 0;
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        if let Ok(meta) = entry.metadata() {
            if meta.is_file() {
                total += 1;
            } else if meta.is_dir() {
                total += count_files_recursive(&entry.path());
            }
        }
    }
    total
}

/// Recursively copy a directory with a per-file progress callback and
/// cancellation check.
///
/// `on_file` is called for every file copied, receiving `(current_index,
/// relative_path)`. `check_cancel` is called before each file copy — when it
/// returns `Err(Cancelled)`, the copy halts mid-walk and propagates the
/// error.
pub fn copy_dir_with_progress<F, C>(
    src: &Path,
    dst: &Path,
    on_file: &mut F,
    check_cancel: &C,
) -> Result<(), AppError>
where
    F: FnMut(&Path),
    C: Fn() -> Result<(), AppError>,
{
    copy_dir_with_progress_inner(src, dst, src, on_file, check_cancel)
}

fn copy_dir_with_progress_inner<F, C>(
    src: &Path,
    dst: &Path,
    root: &Path,
    on_file: &mut F,
    check_cancel: &C,
) -> Result<(), AppError>
where
    F: FnMut(&Path),
    C: Fn() -> Result<(), AppError>,
{
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        check_cancel()?;
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if entry.file_type()?.is_dir() {
            copy_dir_with_progress_inner(&src_path, &dst_path, root, on_file, check_cancel)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
            let rel = src_path.strip_prefix(root).unwrap_or(&src_path);
            on_file(rel);
        }
    }
    Ok(())
}

/// Turn a save directory name into a human-readable label.
pub fn prettify_save_dir_name(dir_name: &str) -> String {
    match dir_name {
        "autosave" => "Autosave".to_string(),
        "autosave_job" => "Autosave (Job)".to_string(),
        name => {
            if let Ok(n) = name.parse::<u32>() {
                format!("Save #{}", n)
            } else {
                name.replace('_', " ")
            }
        }
    }
}

/// Read the display name from a save's info.sii file.
pub fn read_save_display_name(save_path: &Path) -> Option<String> {
    let info_sii = save_path.join("info.sii");
    if !info_sii.exists() {
        return None;
    }
    let data = fs::read(&info_sii).ok()?;
    let text = sii::decode_sii_file(&data).ok()?;
    sii::first_object_string(&text, "name")
}

/// Count save directories in a profile.
///
/// Returns 0 if the `save/` directory doesn't exist (normal for a fresh
/// profile) or if it can't be read (logged).
pub fn count_saves(profile_path: &Path) -> usize {
    let save_dir = profile_path.join("save");
    if !save_dir.exists() {
        return 0;
    }
    match fs::read_dir(&save_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .count(),
        Err(e) => {
            crate::warn_fallback!("count_saves: could not read {}: {e}", save_dir.display());
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_prettify_save_dir_name() {
        assert_eq!(prettify_save_dir_name("autosave"), "Autosave");
        assert_eq!(prettify_save_dir_name("autosave_job"), "Autosave (Job)");
        assert_eq!(prettify_save_dir_name("1"), "Save #1");
        assert_eq!(prettify_save_dir_name("3"), "Save #3");
        assert_eq!(
            prettify_save_dir_name("autosave_drive_2"),
            "autosave drive 2"
        );
        assert_eq!(
            prettify_save_dir_name("multiplayer_backup"),
            "multiplayer backup"
        );
    }

    #[test]
    fn test_count_files_recursive() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("a/b")).unwrap();
        fs::create_dir_all(root.join("a/c")).unwrap();
        fs::write(root.join("top.txt"), b"1").unwrap();
        fs::write(root.join("a/one.txt"), b"2").unwrap();
        fs::write(root.join("a/b/two.txt"), b"3").unwrap();
        fs::write(root.join("a/c/three.txt"), b"4").unwrap();
        assert_eq!(count_files_recursive(root), 4);
    }

    #[test]
    fn test_count_files_recursive_empty_dir_is_zero() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(count_files_recursive(tmp.path()), 0);
    }

    #[test]
    fn test_count_files_recursive_unreadable_dir_is_zero() {
        assert_eq!(count_files_recursive(Path::new("/nonexistent/xyz")), 0);
    }

    #[test]
    fn test_copy_dir_with_progress_copies_all_and_reports() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        fs::create_dir_all(src.join("nested")).unwrap();
        fs::write(src.join("a.txt"), b"A").unwrap();
        fs::write(src.join("nested/b.txt"), b"B").unwrap();
        fs::write(src.join("nested/c.txt"), b"C").unwrap();

        let dst = tmp.path().join("dst");
        let mut observed: Vec<PathBuf> = Vec::new();
        copy_dir_with_progress(
            &src,
            &dst,
            &mut |rel| observed.push(rel.to_path_buf()),
            &|| Ok(()),
        )
        .unwrap();

        assert_eq!(fs::read(dst.join("a.txt")).unwrap(), b"A");
        assert_eq!(fs::read(dst.join("nested/b.txt")).unwrap(), b"B");
        assert_eq!(fs::read(dst.join("nested/c.txt")).unwrap(), b"C");
        assert_eq!(observed.len(), 3, "callback fired once per file");
    }

    #[test]
    fn test_copy_dir_with_progress_propagates_cancel() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        fs::create_dir_all(src.join("nested")).unwrap();
        fs::write(src.join("a.txt"), b"A").unwrap();

        let dst = tmp.path().join("dst");
        let err = copy_dir_with_progress(
            &src,
            &dst,
            &mut |_| {},
            &|| Err(AppError::Cancelled),
        )
        .unwrap_err();
        assert!(matches!(err, AppError::Cancelled));
    }

    #[test]
    fn test_format_modified_time_returns_rfc3339_for_existing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let f = tmp.path().join("stamp.txt");
        fs::write(&f, b"data").unwrap();
        let formatted = format_modified_time(&f).expect("timestamp must be readable");
        // Parse via chrono to make sure the emitted string is RFC 3339.
        chrono::DateTime::parse_from_rfc3339(&formatted).expect("must parse as RFC 3339");
    }

    #[test]
    fn test_format_modified_time_returns_none_for_missing_path() {
        assert!(format_modified_time(Path::new("/nonexistent/path.txt")).is_none());
    }

    #[test]
    fn test_atomic_replace_verified_writes_and_keeps_backup() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("live.txt");
        let backup = tmp.path().join("live.txt.bak");
        fs::write(&target, b"original").unwrap();

        atomic_replace_verified(&target, Some(&backup), b"updated", |_| Ok(())).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"updated");
        assert_eq!(fs::read(&backup).unwrap(), b"original");
    }

    #[test]
    fn test_atomic_replace_verified_rejects_failed_verification() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("live.txt");
        fs::write(&target, b"original").unwrap();

        let err = atomic_replace_verified(&target, None, b"corrupt", |_| {
            Err(AppError::Parse("bad content".to_string()))
        })
        .unwrap_err();
        assert!(matches!(err, AppError::Parse(_)));
        assert_eq!(
            fs::read(&target).unwrap(),
            b"original",
            "target must be untouched when verify fails"
        );
        // Tmp sibling should also be cleaned up.
        let tmp_sibling = target.with_file_name("live.txt.tmp");
        assert!(!tmp_sibling.exists(), "staging file must be removed");
    }
}
