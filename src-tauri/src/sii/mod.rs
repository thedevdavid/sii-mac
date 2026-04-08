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
