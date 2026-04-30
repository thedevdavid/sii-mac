//! Profile.sii metadata reading and field extraction.
//!
//! Uses the shared `sii::parser` so profile.sii and game.sii go through the
//! same parse path. No ad-hoc line scanning.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::profile::models::ModEntry;
use crate::sii;
use crate::sii::parser::parse_siin;
use crate::sii::types::{SiiObject, SiiValue};

const CACHED_STATS_LEN: usize = 20;

/// Lightweight profile summary pulled from profile.sii for sidebar display.
///
/// Only `company_name` is currently consumed by the UI, but the struct keeps
/// the door open for richer summary fields without reshuffling call sites.
#[derive(Debug, Default)]
pub struct ProfileSummaryFields {
    pub company_name: Option<String>,
}

/// Read lightweight profile metadata for sidebar display.
pub fn read_profile_metadata(profile_path: &Path) -> Result<ProfileSummaryFields, AppError> {
    let Some(sii_path) = find_profile_sii(profile_path) else {
        return Ok(ProfileSummaryFields::default());
    };

    let data = fs::read(&sii_path)?;
    let text = sii::decode_sii_file(&data)?;
    let doc = parse_siin(&text).map_err(AppError::SiiDecode)?;
    let Some(obj) = doc.objects.first() else {
        return Ok(ProfileSummaryFields::default());
    };

    Ok(ProfileSummaryFields {
        company_name: obj.get_string("company_name").map(str::to_string),
    })
}

/// Decode a profile's SII file to plaintext.
pub fn read_decoded_profile_text(profile_path: &Path) -> Result<String, AppError> {
    let sii_path = find_profile_sii(profile_path)
        .ok_or_else(|| AppError::NotFound("No profile.sii found".to_string()))?;
    let data = fs::read(&sii_path)?;
    sii::decode_sii_file(&data)
}

/// Locate the profile.sii file. Returns None if it doesn't exist.
pub fn find_profile_sii(profile_path: &Path) -> Option<PathBuf> {
    let direct = profile_path.join("profile.sii");
    direct.exists().then_some(direct)
}

/// Extract all rich profile fields from decoded profile.sii text.
pub fn extract_all_profile_fields(text: &str) -> ProfileFields {
    // Parse failures are treated as "no fields" rather than an error because
    // this path feeds the profile list UI — we want the list to render even
    // if one profile's .sii is weird. The error is already logged upstream.
    let Ok(doc) = parse_siin(text) else {
        return ProfileFields::default();
    };
    let Some(obj) = doc.objects.first() else {
        return ProfileFields::default();
    };

    let company_name = obj.get_string("company_name").map(str::to_string);
    let experience_points = obj.get_int("experience_points").and_then(i64_as_u64);
    let money = obj.get_int("money_account").and_then(i64_as_u64);
    let face = obj.get_int("face").and_then(|n| u32::try_from(n).ok());
    let brand = obj.get_string("brand").map(str::to_string);
    let logo = obj.get_string("logo").map(str::to_string);
    let male = match obj.get("male") {
        Some(SiiValue::Bool(b)) => Some(*b),
        _ => None,
    };
    let map_path = obj.get_string("map_path").map(str::to_string);
    let cached_experience = obj.get_int("cached_experience").and_then(i64_as_u64);
    let cached_distance = obj.get_float("cached_distance");
    let cached_stats = {
        let stats = extract_indexed_u64_array(obj, "cached_stats", CACHED_STATS_LEN);
        stats.iter().any(|&v| v > 0).then_some(stats)
    };
    let online_user_name = obj
        .get_string("online_user_name")
        .map(str::to_string)
        .filter(|s| !s.is_empty());
    let creation_time = obj
        .get_int("creation_time")
        .and_then(i64_as_u64)
        .and_then(epoch_seconds_to_rfc3339);
    let save_time = obj
        .get_int("save_time")
        .and_then(i64_as_u64)
        .and_then(epoch_seconds_to_rfc3339);
    let version = obj.get_int("version").and_then(|n| u32::try_from(n).ok());
    let customization = obj
        .get_int("customization")
        .and_then(|n| u32::try_from(n).ok());
    let active_mods = extract_active_mods_from_obj(obj);

    ProfileFields {
        company_name,
        experience_points,
        money,
        face,
        brand,
        logo,
        male,
        map_path,
        cached_experience,
        cached_distance,
        cached_stats,
        online_user_name,
        creation_time,
        save_time,
        version,
        customization,
        active_mods,
    }
}

fn i64_as_u64(n: i64) -> Option<u64> {
    u64::try_from(n).ok()
}

/// Convert a Unix-seconds timestamp to an RFC 3339 string, matching the
/// wire format used by `utils::format_modified_time` and `backup_profile`.
/// Returns `None` if the value overflows `i64` or cannot be constructed as
/// a valid timestamp.
fn epoch_seconds_to_rfc3339(secs: u64) -> Option<String> {
    let secs = i64::try_from(secs).ok()?;
    chrono::DateTime::from_timestamp(secs, 0).map(|dt| dt.to_rfc3339())
}

fn extract_indexed_u64_array(obj: &SiiObject, name: &str, len: usize) -> Vec<u64> {
    let prefix = format!("{name}[");
    let mut out = vec![0u64; len];
    for field in &obj.fields {
        let Some(rest) = field.name.strip_prefix(&prefix) else {
            continue;
        };
        let Some(idx_str) = rest.strip_suffix(']') else {
            continue;
        };
        let Ok(idx) = idx_str.parse::<usize>() else {
            continue;
        };
        if idx >= len {
            continue;
        }
        if let SiiValue::Integer(n) = field.value {
            if let Ok(u) = u64::try_from(n) {
                out[idx] = u;
            }
        }
    }
    out
}

pub(crate) fn extract_active_mods_from_obj(obj: &SiiObject) -> Vec<ModEntry> {
    let mut mods: Vec<(usize, ModEntry)> = Vec::new();
    for field in &obj.fields {
        let Some(rest) = field.name.strip_prefix("active_mods[") else {
            continue;
        };
        let Some(idx_str) = rest.strip_suffix(']') else {
            continue;
        };
        let Ok(idx) = idx_str.parse::<usize>() else {
            continue;
        };
        let SiiValue::String(val) = &field.value else {
            continue;
        };
        let (id, display_name) = match val.split_once('|') {
            Some((id, name)) => (id.to_string(), name.to_string()),
            None => (val.clone(), val.clone()),
        };
        mods.push((idx, ModEntry { id, display_name }));
    }
    mods.sort_by_key(|(idx, _)| *idx);
    mods.into_iter().map(|(_, m)| m).collect()
}

/// All fields extracted from profile.sii.
///
/// `creation_time` and `save_time` are stored as RFC 3339 strings (converted
/// from the raw Unix-seconds values in the file) so every timestamp crossing
/// the IPC boundary uses one format.
#[derive(Default)]
pub struct ProfileFields {
    pub company_name: Option<String>,
    pub experience_points: Option<u64>,
    pub money: Option<u64>,
    pub face: Option<u32>,
    pub brand: Option<String>,
    pub logo: Option<String>,
    pub male: Option<bool>,
    pub map_path: Option<String>,
    pub cached_experience: Option<u64>,
    pub cached_distance: Option<f64>,
    pub cached_stats: Option<Vec<u64>>,
    pub online_user_name: Option<String>,
    pub creation_time: Option<String>,
    pub save_time: Option<String>,
    pub version: Option<u32>,
    pub customization: Option<u32>,
    pub active_mods: Vec<ModEntry>,
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"SiiNunit
{
profile_save : .profile {
 profile_name: "TestProfile"
 company_name: "My Company"
 money_account: 50000
 experience_points: 12345
 male: true
 face: 5
 cached_distance: 1234.5
 cached_stats: 3
 cached_stats[0]: 100
 cached_stats[1]: 200
 cached_stats[2]: 300
 active_mods: 2
 active_mods[0]: "mod_one|Mod One"
 active_mods[1]: "mod_two|Mod Two"
}
}"#;

    #[test]
    fn test_extract_all_profile_fields() {
        let f = extract_all_profile_fields(SAMPLE);
        assert_eq!(f.company_name.as_deref(), Some("My Company"));
        assert_eq!(f.money, Some(50000));
        assert_eq!(f.experience_points, Some(12345));
        assert_eq!(f.face, Some(5));
        assert_eq!(f.male, Some(true));
        assert_eq!(f.cached_distance, Some(1234.5));
    }

    #[test]
    fn test_cached_stats_partial_array() {
        let f = extract_all_profile_fields(SAMPLE);
        let stats = f.cached_stats.expect("cached_stats should be Some");
        assert_eq!(stats.len(), CACHED_STATS_LEN);
        assert_eq!(&stats[..3], &[100, 200, 300]);
        assert!(stats[3..].iter().all(|&v| v == 0));
    }

    #[test]
    fn test_active_mods_preserves_order() {
        let f = extract_all_profile_fields(SAMPLE);
        assert_eq!(f.active_mods.len(), 2);
        assert_eq!(f.active_mods[0].id, "mod_one");
        assert_eq!(f.active_mods[0].display_name, "Mod One");
        assert_eq!(f.active_mods[1].id, "mod_two");
    }

    #[test]
    fn test_empty_on_parse_failure() {
        let f = extract_all_profile_fields("not a valid sii file");
        assert!(f.company_name.is_none());
        assert!(f.active_mods.is_empty());
    }
}
