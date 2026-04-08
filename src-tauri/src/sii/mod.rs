use crate::error::AppError;

/// Decode an SII file (encrypted, binary, or text) into its plaintext SIIN representation.
/// Uses sii_decode crate for format detection and decoding.
pub fn decode_sii_file(data: &[u8]) -> Result<String, AppError> {
    let decoded = sii_decode::file_type::decode_until_siin(data)
        .map_err(|e| AppError::SiiDecode(format!("{:?}", e)))?;
    String::from_utf8(decoded).map_err(|e| AppError::SiiDecode(e.to_string()))
}

/// Extract a specific field value from decoded SII plaintext.
pub fn extract_field(sii_text: &str, field_name: &str) -> Option<String> {
    for line in sii_text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(&format!("{}:", field_name)) {
            return Some(rest.trim().to_string());
        }
        // Also try with leading space (nested fields)
        if let Some(rest) = trimmed.strip_prefix(&format!(" {}:", field_name)) {
            return Some(rest.trim().to_string());
        }
    }
    None
}

/// Extract a quoted string field value (removes surrounding quotes).
pub fn extract_string_field(sii_text: &str, field_name: &str) -> Option<String> {
    extract_field(sii_text, field_name).map(|v| v.trim_matches('"').to_string())
}

/// Extract a numeric field value.
pub fn extract_u64_field(sii_text: &str, field_name: &str) -> Option<u64> {
    extract_field(sii_text, field_name).and_then(|v| v.parse().ok())
}

/// Extract a boolean field value (true/false).
pub fn extract_bool_field(sii_text: &str, field_name: &str) -> Option<bool> {
    extract_field(sii_text, field_name).and_then(|v| match v.as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    })
}

/// Extract a floating-point field value.
pub fn extract_f64_field(sii_text: &str, field_name: &str) -> Option<f64> {
    extract_field(sii_text, field_name).and_then(|v| v.parse().ok())
}

/// Extract a u32 field value.
pub fn extract_u32_field(sii_text: &str, field_name: &str) -> Option<u32> {
    extract_field(sii_text, field_name).and_then(|v| v.parse().ok())
}

/// Extract an indexed array of u64 values (e.g. cached_stats[0] through cached_stats[N-1]).
pub fn extract_indexed_array_u64(sii_text: &str, field_name: &str, count: usize) -> Vec<u64> {
    let mut result = vec![0u64; count];
    let prefix = format!("{}[", field_name);
    for line in sii_text.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with(&prefix) {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            // Parse index from "field_name[N]"
            if let Some(idx_str) = key.trim().strip_prefix(&prefix).and_then(|s| s.strip_suffix(']')) {
                if let Ok(idx) = idx_str.parse::<usize>() {
                    if idx < count {
                        if let Ok(val) = value.trim().parse::<u64>() {
                            result[idx] = val;
                        }
                    }
                }
            }
        }
    }
    result
}

/// Check if a profile has an online password set (non-empty).
pub fn has_online_password(sii_text: &str) -> bool {
    extract_string_field(sii_text, "online_password")
        .map(|p| !p.is_empty())
        .unwrap_or(false)
}

/// Extract the active_mods array from decoded profile.sii text.
/// Returns Vec of (mod_id, display_name) tuples.
pub fn extract_active_mods(sii_text: &str) -> Vec<(String, String)> {
    let mut mods = Vec::new();
    for line in sii_text.lines() {
        let trimmed = line.trim();
        // Match lines like: active_mods[0]: "mod_workshop_package.xxx|Display Name"
        if !trimmed.starts_with("active_mods[") {
            continue;
        }
        if let Some((_key, value)) = trimmed.split_once(':') {
            let val = value.trim().trim_matches('"');
            if let Some((id, name)) = val.split_once('|') {
                mods.push((id.to_string(), name.to_string()));
            }
        }
    }
    mods
}
