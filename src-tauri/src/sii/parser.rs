use crate::sii::types::{SiiDocument, SiiField, SiiObject, SiiValue};

/// Parse decoded SIIN plaintext into a structured document.
///
/// Returns an error on unclosed objects (truncated input). This is deliberate:
/// a truncated read followed by a re-serialize would silently overwrite a
/// known-good disk file with a shorter document.
pub fn parse_siin(text: &str) -> Result<SiiDocument, String> {
    let mut doc = SiiDocument::new();
    let mut lines = text.lines().peekable();

    // Skip the "SiiNunit" header
    while let Some(line) = lines.peek() {
        let trimmed = line.trim();
        if trimmed == "SiiNunit" || trimmed == "{" || trimmed.is_empty() {
            lines.next();
            continue;
        }
        break;
    }

    // Parse object blocks
    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed == "}" {
            continue;
        }

        // Object header: "class : id {"
        if let Some((class, id)) = try_parse_object_header(trimmed) {
            let fields = parse_object_body(&mut lines)
                .map_err(|e| format!("in object `{class} : {id}`: {e}"))?;
            doc.push_object(SiiObject { class, id, fields });
        }
    }

    Ok(doc)
}

fn try_parse_object_header(line: &str) -> Option<(String, String)> {
    // Format: "class : id {" or "class : id {"
    if !line.ends_with('{') {
        return None;
    }
    let without_brace = line[..line.len() - 1].trim();
    let parts: Vec<&str> = without_brace.splitn(3, ' ').collect();
    if parts.len() >= 3 && parts[1] == ":" {
        Some((parts[0].to_string(), parts[2].trim().to_string()))
    } else {
        None
    }
}

fn parse_object_body(
    lines: &mut std::iter::Peekable<std::str::Lines<'_>>,
) -> Result<Vec<SiiField>, String> {
    let mut fields = Vec::new();
    let mut closed = false;

    for line in lines.by_ref() {
        let trimmed = line.trim();
        if trimmed == "}" {
            closed = true;
            break;
        }
        if trimmed.is_empty() {
            continue;
        }

        if let Some((name, value_str)) = trimmed.split_once(':') {
            let name = name.trim().to_string();
            let value_str = value_str.trim();
            let value = parse_value(value_str);
            fields.push(SiiField { name, value });
        }
    }

    if !closed {
        return Err("unclosed object (truncated input?)".to_string());
    }
    Ok(fields)
}

fn parse_value(s: &str) -> SiiValue {
    let s = s.trim();

    if s.is_empty() {
        return SiiValue::Nil;
    }

    // Nil
    if s == "nil" {
        return SiiValue::Nil;
    }

    // Quoted string
    if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
        return SiiValue::String(unescape_sii_string(&s[1..s.len() - 1]));
    }

    // Placement: (x; y; z) (w; x; y; z)
    if s.starts_with('(') && s.contains(") (") {
        if let Some(placement) = try_parse_placement(s) {
            return placement;
        }
    }

    // Vector: (x, y, z) or (x; y; z)
    if s.starts_with('(') && s.ends_with(')') {
        if let Some(vec) = try_parse_vector(s) {
            return SiiValue::Vector(vec);
        }
    }

    // Hex-encoded float: &3f400000
    if s.starts_with('&') {
        if let Some(f) = try_parse_hex_float(s) {
            return SiiValue::Float(f);
        }
    }

    // Integer (try before float)
    if let Ok(n) = s.parse::<i64>() {
        return SiiValue::Integer(n);
    }

    // Float
    if let Ok(f) = s.parse::<f64>() {
        return SiiValue::Float(f);
    }

    // Boolean
    if s == "true" {
        return SiiValue::Bool(true);
    }
    if s == "false" {
        return SiiValue::Bool(false);
    }

    // Token (reference, identifier, etc.)
    SiiValue::Token(s.to_string())
}


fn try_parse_placement(s: &str) -> Option<SiiValue> {
    let paren_groups: Vec<&str> = s.split(") (").collect();
    if paren_groups.len() != 2 {
        return None;
    }

    let pos_str = paren_groups[0].trim_start_matches('(').trim();
    let rot_str = paren_groups[1].trim_end_matches(')').trim();

    let pos_parts: Vec<f64> = pos_str
        .split(';')
        .map(|p| parse_number_component(p.trim()))
        .collect::<Option<Vec<_>>>()?;
    let rot_parts: Vec<f64> = rot_str
        .split(';')
        .map(|p| parse_number_component(p.trim()))
        .collect::<Option<Vec<_>>>()?;

    if pos_parts.len() == 3 && rot_parts.len() == 4 {
        Some(SiiValue::Placement {
            position: [pos_parts[0], pos_parts[1], pos_parts[2]],
            rotation: [rot_parts[0], rot_parts[1], rot_parts[2], rot_parts[3]],
        })
    } else {
        None
    }
}

fn try_parse_vector(s: &str) -> Option<Vec<f64>> {
    let inner = s.trim_start_matches('(').trim_end_matches(')');
    let sep = if inner.contains(';') { ';' } else { ',' };
    inner
        .split(sep)
        .map(|p| parse_number_component(p.trim()))
        .collect()
}

fn parse_number_component(s: &str) -> Option<f64> {
    if let Some(stripped) = s.strip_prefix('&') {
        return try_parse_hex_float_raw(stripped);
    }
    s.parse::<f64>().ok()
}

fn try_parse_hex_float(s: &str) -> Option<f64> {
    let hex = s.strip_prefix('&')?;
    try_parse_hex_float_raw(hex)
}

fn try_parse_hex_float_raw(hex: &str) -> Option<f64> {
    let n = u32::from_str_radix(hex, 16).ok()?;
    Some(f32::from_bits(n) as f64)
}

/// Unescape a SIIN string literal's inner content (between the outer quotes).
///
/// Why: the game serializes user-facing strings with C-style escapes for `"` and `\`.
/// A license plate `ABC"X` is stored on disk as `"ABC\"X"`. Without unescaping, the
/// value would round-trip as `ABC\"X`, progressively corrupting `game.sii` on every
/// edit.
pub(crate) fn unescape_sii_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('\\') => out.push('\\'),
            Some('"') => out.push('"'),
            Some(other) => {
                out.push('\\');
                out.push(other);
            }
            None => out.push('\\'),
        }
    }
    out
}

/// Escape a raw string into the inner content of a SIIN string literal (without the
/// surrounding quotes). Matches the inverse of [`unescape_sii_string`].
pub(crate) fn escape_sii_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_object() {
        let text = r#"SiiNunit
{
economy : .economy {
 bank: _nameless.abc
 experience_points: 1000
 money_account: 500000
}
}"#;
        let doc = parse_siin(text).unwrap();
        assert_eq!(doc.objects.len(), 1);
        assert_eq!(doc.objects[0].class, "economy");
        assert_eq!(doc.objects[0].id, ".economy");
        assert_eq!(doc.objects[0].get_int("experience_points"), Some(1000));
        assert_eq!(doc.objects[0].get_int("money_account"), Some(500000));
    }

    #[test]
    fn test_parse_string_field() {
        let text = r#"SiiNunit
{
profile : .profile {
 profile_name: "Test"
 company_name: "My Company"
}
}"#;
        let doc = parse_siin(text).unwrap();
        assert_eq!(doc.objects[0].get_string("profile_name"), Some("Test"));
        assert_eq!(
            doc.objects[0].get_string("company_name"),
            Some("My Company")
        );
    }

    #[test]
    fn test_parse_bool_field() {
        let text = r#"SiiNunit
{
profile : .profile {
 male: true
 online: false
}
}"#;
        let doc = parse_siin(text).unwrap();
        assert_eq!(doc.objects[0].get("male"), Some(&SiiValue::Bool(true)));
        assert_eq!(doc.objects[0].get("online"), Some(&SiiValue::Bool(false)));
    }

    #[test]
    fn test_parse_placement() {
        let text = r#"SiiNunit
{
player : .player {
 truck_placement: (-34567.8; 12.5; 45678.9) (0.5; 0; -0.866; 0)
}
}"#;
        let doc = parse_siin(text).unwrap();
        match doc.objects[0].get("truck_placement") {
            Some(SiiValue::Placement { position, rotation }) => {
                assert!((position[0] - (-34567.8)).abs() < 0.1);
                assert!((rotation[2] - (-0.866)).abs() < 0.001);
            }
            other => panic!("Expected Placement, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_multiple_objects() {
        let text = r#"SiiNunit
{
economy : .economy {
 player: player.vehicle.abc
}
player : player.vehicle.abc {
 assigned_truck: vehicle.storage.123
}
vehicle : vehicle.storage.123 {
 fuel_relative: 0.75
}
}"#;
        let doc = parse_siin(text).unwrap();
        assert_eq!(doc.objects.len(), 3);
        assert_eq!(doc.objects[0].class, "economy");
        assert_eq!(doc.objects[1].class, "player");
        assert_eq!(doc.objects[2].class, "vehicle");
        assert_eq!(
            doc.objects[1].get_token("assigned_truck"),
            Some("vehicle.storage.123")
        );
    }

    #[test]
    fn test_parse_hex_float() {
        let val = parse_value("&3f000000");
        if let SiiValue::Float(f) = val {
            assert!((f - 0.5).abs() < 0.001);
        } else {
            panic!("Expected Float, got {:?}", val);
        }
    }

    #[test]
    fn test_unescape_basic() {
        assert_eq!(unescape_sii_string(r#"hello"#), "hello");
        assert_eq!(unescape_sii_string(r#"a\"b"#), r#"a"b"#);
        assert_eq!(unescape_sii_string(r"a\\b"), r"a\b");
        assert_eq!(unescape_sii_string(r#"\\\"X\\"#), r#"\"X\"#);
    }

    #[test]
    fn test_unescape_preserves_unknown_escapes() {
        assert_eq!(unescape_sii_string(r"\n"), r"\n");
        assert_eq!(unescape_sii_string(r"a\tb"), r"a\tb");
    }

    #[test]
    fn test_unescape_trailing_backslash() {
        assert_eq!(unescape_sii_string(r"abc\"), r"abc\");
    }

    #[test]
    fn test_escape_basic() {
        assert_eq!(escape_sii_string("hello"), "hello");
        assert_eq!(escape_sii_string(r#"a"b"#), r#"a\"b"#);
        assert_eq!(escape_sii_string(r"a\b"), r"a\\b");
    }

    #[test]
    fn test_escape_unescape_roundtrip() {
        for raw in [
            "",
            "simple",
            r#"with "quotes""#,
            r"with \backslash",
            r#"both "\"mixed\"" up"#,
            "Kraków",
            "C:\\Users\\test\\save.sii",
        ] {
            assert_eq!(
                unescape_sii_string(&escape_sii_string(raw)),
                raw,
                "raw: {raw:?}"
            );
        }
    }

    #[test]
    fn test_parse_rejects_truncated_object() {
        let text = "SiiNunit\n{\neconomy : .economy {\n bank: abc\n money_account: 500000\n";
        let err = parse_siin(text).expect_err("truncated input must fail");
        assert!(err.contains("unclosed"), "got: {err}");
    }

    #[test]
    fn test_parse_rejects_truncated_mid_field() {
        let text = "SiiNunit\n{\ntruck : vehicle.abc {\n engine_wear: 500000";
        let err = parse_siin(text).expect_err("truncated mid-field must fail");
        assert!(err.contains("unclosed"), "got: {err}");
    }

    #[test]
    fn test_parse_accepts_well_formed_empty_object() {
        let text = "SiiNunit\n{\neconomy : .economy {\n}\n}\n";
        let doc = parse_siin(text).expect("well-formed empty object should parse");
        assert_eq!(doc.objects.len(), 1);
        assert!(doc.objects[0].fields.is_empty());
    }

    #[test]
    fn test_parse_escaped_quoted_string() {
        let text = r#"SiiNunit
{
truck : vehicle.abc {
 license_plate_text: "ABC\"X"
 name_prefix: "a\\b"
}
}"#;
        let doc = parse_siin(text).unwrap();
        assert_eq!(
            doc.objects[0].get_string("license_plate_text"),
            Some(r#"ABC"X"#)
        );
        assert_eq!(doc.objects[0].get_string("name_prefix"), Some(r"a\b"));
    }

    #[test]
    #[ignore] // requires real game save file
    fn test_decode_real_game_sii() {
        let home = std::env::var("HOME").unwrap();
        let path = format!(
            "{}/Library/Application Support/American Truck Simulator/profiles/4A75737453747265737365644F7574/save/1/game.sii",
            home
        );
        if !std::path::Path::new(&path).exists() {
            eprintln!("Skipping: save file not found at {}", path);
            return;
        }

        let data = std::fs::read(&path).unwrap();
        let decoded = sii_decode::file_type::decode_until_siin(&data).unwrap();
        let text = String::from_utf8(decoded).unwrap();

        let doc = parse_siin(&text).unwrap();

        // Print summary
        let mut class_counts: std::collections::HashMap<&str, usize> =
            std::collections::HashMap::new();
        for obj in &doc.objects {
            *class_counts.entry(&obj.class).or_insert(0) += 1;
        }
        let mut sorted: Vec<_> = class_counts.into_iter().collect();
        sorted.sort_by(|a, b| b.1.cmp(&a.1));

        eprintln!("\n=== REAL GAME.SII PARSE RESULTS ===");
        eprintln!("Total objects: {}", doc.objects.len());
        eprintln!("\nObject types (top 30):");
        for (class, count) in sorted.iter().take(30) {
            eprintln!("  {:40} {}", class, count);
        }

        // Check economy
        if let Some(econ) = doc.find_by_class("economy") {
            eprintln!("\nEconomy fields:");
            for field in econ.fields.iter().take(20) {
                eprintln!("  {}: {:?}", field.name, field.value);
            }
        }

        // Check for vehicle objects
        let vehicles = doc.find_all_by_class("vehicle");
        eprintln!("\nVehicles found: {}", vehicles.len());
        if let Some(v) = vehicles.first() {
            eprintln!("First vehicle fields:");
            for field in v.fields.iter().take(15) {
                eprintln!("  {}: {:?}", field.name, field.value);
            }
        }

        assert!(doc.objects.len() > 10, "Should parse many objects");
    }
}
