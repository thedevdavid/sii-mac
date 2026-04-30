use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::utils::atomic_replace_verified;
use serde::{Deserialize, Serialize};

/// Game config settings extracted from the game root config.cfg.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameConfig {
    pub developer: bool,
    pub console: bool,
    pub save_format: i32,
    pub config_path: String,
}

/// Read game configuration from the game root config.cfg.
#[tauri::command]
pub fn get_game_config(game_base_path: String) -> Result<GameConfig, AppError> {
    let config_path = Path::new(&game_base_path).join("config.cfg");
    if !config_path.exists() {
        return Err(AppError::NotFound(format!(
            "config.cfg not found at {}",
            config_path.display()
        )));
    }

    let text = fs::read_to_string(&config_path)?;

    Ok(GameConfig {
        developer: read_uset_bool(&text, "g_developer"),
        console: read_uset_bool(&text, "g_console"),
        save_format: read_uset_int(&text, "g_save_format").unwrap_or(0),
        config_path: config_path.to_string_lossy().to_string(),
    })
}

// Config keys the UI is allowed to write, paired with the set of valid values.
// Keeping the allowlist narrow lets us reject any injection attempt (embedded
// quotes, newlines, extra `uset` lines) before it reaches the file.
const ALLOWED_KEYS: &[&str] = &[
    "g_developer",
    "g_console",
    "g_console_state",
    "g_save_format",
];

fn validate_config_value(key: &str, value: &str) -> Result<(), AppError> {
    // All allowlisted keys take small numeric values. Restricting to ASCII
    // digits rejects injection via `"` / `\n` / `\\` / control chars and
    // obviates quoting concerns downstream.
    if value.is_empty() || !value.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::InvalidName(format!(
            "invalid value for {key}: only digit sequences are allowed"
        )));
    }
    if value.len() > 10 {
        return Err(AppError::InvalidName(format!(
            "invalid value for {key}: too long"
        )));
    }
    Ok(())
}

/// Update a specific config setting in config.cfg.
#[tauri::command]
pub fn update_game_config(
    game_base_path: String,
    key: String,
    value: String,
) -> Result<(), AppError> {
    let config_path = Path::new(&game_base_path).join("config.cfg");
    if !config_path.exists() {
        return Err(AppError::NotFound("config.cfg not found".into()));
    }

    if !ALLOWED_KEYS.contains(&key.as_str()) {
        return Err(AppError::InvalidName(format!("Unknown config key: {key}")));
    }
    validate_config_value(&key, &value)?;

    let text = fs::read_to_string(&config_path)?;
    let new_line = format!("uset {key} \"{value}\"");

    // Splice in place instead of round-tripping through `lines().join("\n")`,
    // which drops `\r\n` line endings and any trailing blank lines.
    let final_text = match find_uset_line(&text, &key) {
        Some((start, end)) => {
            let mut out = String::with_capacity(text.len() + new_line.len());
            out.push_str(&text[..start]);
            out.push_str(&new_line);
            out.push_str(&text[end..]);
            out
        }
        None => {
            let sep = if text.is_empty() || text.ends_with('\n') {
                ""
            } else {
                "\n"
            };
            format!("{text}{sep}{new_line}\n")
        }
    };

    let backup = config_path.with_extension("cfg.bak");
    atomic_replace_verified(&config_path, Some(&backup), final_text.as_bytes(), |_| {
        Ok(())
    })
}

/// Locate an existing `uset <key> ...` line in the file and return the byte
/// range covering it (excluding the terminating newline sequence, whether
/// `\n` or `\r\n`). Returns `None` if the key is not present.
///
/// The `\r` is deliberately excluded from the range so that a CRLF file
/// survives a splice-replace intact — the caller inserts its unterminated
/// replacement and the existing `\r\n` at `end` remains in place.
fn find_uset_line(text: &str, key: &str) -> Option<(usize, usize)> {
    let target = format!("uset {key} ");
    let mut cursor = 0;
    while cursor < text.len() {
        let line_end = text[cursor..]
            .find('\n')
            .map(|i| cursor + i)
            .unwrap_or(text.len());
        // Exclude a trailing `\r` from the replace range so splicing keeps
        // the existing CRLF sequence.
        let content_end = if line_end > cursor && text.as_bytes()[line_end - 1] == b'\r' {
            line_end - 1
        } else {
            line_end
        };
        let line = &text[cursor..content_end];
        if line.trim_start().starts_with(&target) {
            return Some((cursor, content_end));
        }
        cursor = line_end + 1;
    }
    None
}

fn read_uset_bool(text: &str, key: &str) -> bool {
    read_uset_value(text, key)
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false)
}

fn read_uset_int(text: &str, key: &str) -> Option<i32> {
    read_uset_value(text, key).and_then(|v| v.parse().ok())
}

fn read_uset_value(text: &str, key: &str) -> Option<String> {
    let prefix = format!("uset {key} ");
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(&prefix) {
            let val = trimmed[prefix.len()..].trim().trim_matches('"');
            return Some(val.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_uset_line_found() {
        let text = "uset r_fullscreen \"1\"\nuset g_developer \"0\"\nuset g_console \"1\"\n";
        let (start, end) = find_uset_line(text, "g_developer").unwrap();
        assert_eq!(&text[start..end], "uset g_developer \"0\"");
    }

    #[test]
    fn test_find_uset_line_missing() {
        let text = "uset r_fullscreen \"1\"\nuset g_console \"1\"\n";
        assert!(find_uset_line(text, "g_developer").is_none());
    }

    #[test]
    fn test_find_uset_line_preserves_crlf() {
        let text = "uset a \"1\"\r\nuset g_developer \"0\"\r\nuset z \"2\"\r\n";
        let (start, end) = find_uset_line(text, "g_developer").unwrap();
        // Range excludes the entire `\r\n` so splicing a replacement line
        // preserves the CRLF sequence.
        assert_eq!(&text[start..end], "uset g_developer \"0\"");
    }

    #[test]
    fn test_update_game_config_crlf_roundtrip() {
        use std::fs;

        let tmp = tempfile::tempdir().unwrap();
        let cfg_path = tmp.path().join("config.cfg");
        let initial = "uset a \"1\"\r\nuset g_developer \"0\"\r\nuset z \"2\"\r\n";
        fs::write(&cfg_path, initial).unwrap();

        update_game_config(
            tmp.path().to_string_lossy().to_string(),
            "g_developer".to_string(),
            "1".to_string(),
        )
        .unwrap();

        let after = fs::read_to_string(&cfg_path).unwrap();
        assert_eq!(
            after, "uset a \"1\"\r\nuset g_developer \"1\"\r\nuset z \"2\"\r\n",
            "CRLF must survive the splice intact"
        );
    }

    #[test]
    fn test_validator_accepts_digits() {
        assert!(validate_config_value("g_developer", "0").is_ok());
        assert!(validate_config_value("g_developer", "1").is_ok());
        assert!(validate_config_value("g_save_format", "2").is_ok());
    }

    #[test]
    fn test_validator_rejects_empty() {
        assert!(validate_config_value("g_developer", "").is_err());
    }

    #[test]
    fn test_validator_rejects_injected_quote() {
        // The classic injection: `0" \nuset g_developer "1` would close the
        // current assignment and inject a new uset line.
        assert!(validate_config_value("g_developer", r#"0" "#).is_err());
        assert!(validate_config_value("g_developer", "0\nuset g_dev 1").is_err());
    }

    #[test]
    fn test_validator_rejects_backslash_and_control() {
        assert!(validate_config_value("g_developer", "0\\1").is_err());
        assert!(validate_config_value("g_developer", "0\r\n").is_err());
    }

    #[test]
    fn test_validator_rejects_non_numeric() {
        assert!(validate_config_value("g_developer", "true").is_err());
        assert!(validate_config_value("g_developer", "0x1").is_err());
        assert!(validate_config_value("g_developer", "-1").is_err());
    }

    #[test]
    fn test_validator_rejects_overlong() {
        assert!(validate_config_value("g_developer", "12345678901").is_err());
    }
}
