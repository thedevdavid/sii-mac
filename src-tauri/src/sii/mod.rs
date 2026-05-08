pub mod parser;
pub mod types;
pub mod writer;

use crate::error::AppError;
use crate::profile::models::ModEntry;
use crate::sii::parser::parse_siin;
use crate::sii::types::SiiValue;

/// Decode an SII file (encrypted, binary, or text) into its plaintext SIIN representation.
pub fn decode_sii_file(data: &[u8]) -> Result<String, AppError> {
    let decoded = sii_decode::file_type::decode_until_siin(data)
        .map_err(|e| AppError::SiiDecode(format!("{e:?}")))?;
    String::from_utf8(decoded).map_err(|e| AppError::SiiDecode(e.to_string()))
}

/// On-disk format of an SII file, derived from its 4-byte magic header.
///
/// We can decode all of these into plaintext SIIN, but our writer only emits
/// plaintext. Rewriting a binary save back as plaintext changes the on-disk
/// format and the game refuses to load it (unless `g_save_format = 2` is set
/// in `config.cfg`). Use [`detect_format`] before writing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SiiFileFormat {
    /// Plaintext SiiNunit. Magic: `SiiN`.
    Plaintext,
    /// Encrypted ScsC container. Magic: `ScsC`.
    Encrypted,
    /// Binary BSII. Magic: `BSII`.
    BinaryBsii,
    /// 3nK obfuscated. Magic: `3nK\x01`.
    Obfuscated3nK,
    /// Unknown / too small.
    Unknown,
}

/// Detect the on-disk format from the first 4 bytes.
pub fn detect_format(data: &[u8]) -> SiiFileFormat {
    if data.len() < 4 {
        return SiiFileFormat::Unknown;
    }
    match &data[0..4] {
        b"SiiN" => SiiFileFormat::Plaintext,
        b"ScsC" => SiiFileFormat::Encrypted,
        b"BSII" => SiiFileFormat::BinaryBsii,
        b"3nK\x01" => SiiFileFormat::Obfuscated3nK,
        _ => SiiFileFormat::Unknown,
    }
}

/// Parse a single-object SIIN document and return the first object's string
/// field value. Returns `None` if the parse fails, the document is empty, or
/// the field is missing.
///
/// Lightweight convenience for "metadata-style" .sii files (`profile.sii`,
/// `manifest.sii`, `info.sii`) where the caller wants one field out of a
/// single known object.
pub fn first_object_string(text: &str, field: &str) -> Option<String> {
    let doc = parse_siin(text).ok()?;
    let obj = doc.objects.first()?;
    obj.get_string(field).map(str::to_string)
}

/// Parse a single-object SIIN document and collect every string field whose
/// name matches `field_name` (including repeated `foo[]:` entries). Useful
/// for mod manifests which declare `category[]:` and `compatible_versions[]:`
/// as repeated fields rather than indexed arrays.
pub fn first_object_string_list(text: &str, field_name: &str) -> Vec<String> {
    let Ok(doc) = parse_siin(text) else {
        return Vec::new();
    };
    let Some(obj) = doc.objects.first() else {
        return Vec::new();
    };
    obj.fields
        .iter()
        .filter(|f| f.name == field_name)
        .filter_map(|f| match &f.value {
            SiiValue::String(s) => Some(s.clone()),
            _ => None,
        })
        .collect()
}

/// Parse a single-object SIIN document and extract the `active_mods` indexed
/// array as `(id, display_name)` pairs in **display order** — first entry is
/// the top of the in-game Mod Manager UI / highest priority. SCS stores the
/// array inverted (`active_mods[N-1]` is top of UI), so this function reverses
/// the on-disk order. Returns an empty vec on parse failure or if the document
/// has no objects. See `crate::profile::mod_writer::read_active_mods` for the
/// canonical doc on this convention.
pub fn first_object_active_mods(text: &str) -> Vec<ModEntry> {
    let Ok(doc) = parse_siin(text) else {
        return Vec::new();
    };
    let Some(obj) = doc.objects.first() else {
        return Vec::new();
    };
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
    mods.sort_by_key(|(idx, _)| std::cmp::Reverse(*idx));
    mods.into_iter().map(|(_, m)| m).collect()
}
