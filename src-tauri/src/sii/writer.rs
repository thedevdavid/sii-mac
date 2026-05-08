use crate::sii::parser::escape_sii_string;
use crate::sii::types::{SiiDocument, SiiField, SiiObject, SiiValue};

/// Serialize an SiiDocument back to SIIN plaintext format.
/// The game accepts plaintext SiiNunit — no re-encryption needed.
pub fn serialize_siin(doc: &SiiDocument) -> String {
    let mut out = String::with_capacity(64 * 1024);
    out.push_str("SiiNunit\n{\n");

    for obj in &doc.objects {
        serialize_object(&mut out, obj);
        out.push('\n');
    }

    out.push_str("}\n");
    out
}

fn serialize_object(out: &mut String, obj: &SiiObject) {
    out.push_str(&obj.class);
    out.push_str(" : ");
    out.push_str(&obj.id);
    out.push_str(" {\n");

    for field in &obj.fields {
        serialize_field(out, field);
    }

    out.push_str("}\n");
}

fn serialize_field(out: &mut String, field: &SiiField) {
    out.push(' ');
    out.push_str(&field.name);
    out.push_str(": ");
    serialize_value(out, &field.value);
    out.push('\n');
}

fn serialize_value(out: &mut String, value: &SiiValue) {
    match value {
        SiiValue::String(s) => {
            out.push('"');
            out.push_str(&escape_sii_string(s));
            out.push('"');
        }
        SiiValue::Token(s) => out.push_str(s),
        SiiValue::Integer(n) => out.push_str(&n.to_string()),
        // Plain digits — never `<n>.0`. The game's save parser rejects the
        // decimal-point form for u64 hash fields like `company_check_hash`.
        SiiValue::UInt(n) => out.push_str(&n.to_string()),
        SiiValue::Float(f) => {
            // Use enough precision to round-trip
            if f.fract() == 0.0 {
                out.push_str(&format!("{:.1}", f));
            } else {
                out.push_str(&format!("{}", f));
            }
        }
        SiiValue::HexFloat(bits) => {
            out.push('&');
            out.push_str(&format!("{bits:08x}"));
        }
        SiiValue::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        SiiValue::Nil => out.push_str("nil"),
        SiiValue::Placement { position, rotation } => {
            out.push_str(&format!(
                "({}; {}; {}) ({}; {}; {}; {})",
                format_coord(position[0]),
                format_coord(position[1]),
                format_coord(position[2]),
                format_coord(rotation[0]),
                format_coord(rotation[1]),
                format_coord(rotation[2]),
                format_coord(rotation[3]),
            ));
        }
        SiiValue::Vector(components) => {
            out.push('(');
            for (i, c) in components.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                out.push_str(&format_coord(*c));
            }
            out.push(')');
        }
    }
}

fn format_coord(v: f64) -> String {
    // SCS writes integer-valued vector/placement components without a decimal
    // point: `(0, 0, 0)` not `(0.0, 0.0, 0.0)`. Emitting the `.0` form makes
    // the game's save loader reject the file. Match the canonical form.
    if v.fract() == 0.0 && v.is_finite() && (v.abs() < (i64::MAX as f64)) {
        format!("{}", v as i64)
    } else {
        format!("{}", v)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sii::parser::parse_siin;

    #[test]
    fn test_roundtrip_simple() {
        let input = "SiiNunit\n{\neconomy : .economy {\n bank: _nameless.abc\n money_account: 500000\n}\n\n}\n";
        let doc = parse_siin(input).unwrap();
        let output = serialize_siin(&doc);

        // Re-parse the output
        let doc2 = parse_siin(&output).unwrap();
        assert_eq!(doc2.objects.len(), doc.objects.len());
        assert_eq!(doc2.objects[0].class, "economy");
        assert_eq!(doc2.objects[0].get_int("money_account"), Some(500000));
    }

    fn doc_with_one(obj: SiiObject) -> SiiDocument {
        let mut doc = SiiDocument::new();
        doc.push_object(obj);
        doc
    }

    #[test]
    fn test_serialize_string() {
        let doc = doc_with_one(SiiObject {
            class: "test".into(),
            id: ".test".into(),
            fields: vec![SiiField {
                name: "name".into(),
                value: SiiValue::String("Hello World".into()),
            }],
        });
        let output = serialize_siin(&doc);
        assert!(output.contains("name: \"Hello World\""));
    }

    fn roundtrip_string(raw: &str) -> String {
        let doc = doc_with_one(SiiObject {
            class: "test".into(),
            id: ".test".into(),
            fields: vec![SiiField {
                name: "name".into(),
                value: SiiValue::String(raw.into()),
            }],
        });
        let output = serialize_siin(&doc);
        let reparsed = parse_siin(&output).expect("reparse must succeed");
        match reparsed.objects[0].get("name") {
            Some(SiiValue::String(s)) => s.clone(),
            other => panic!("expected String, got {:?}", other),
        }
    }

    #[test]
    fn test_string_roundtrip_with_quotes() {
        assert_eq!(roundtrip_string(r#"ABC"X"#), r#"ABC"X"#);
        assert_eq!(roundtrip_string(r#""quoted""#), r#""quoted""#);
    }

    #[test]
    fn test_string_roundtrip_with_backslashes() {
        assert_eq!(roundtrip_string(r"a\b"), r"a\b");
        assert_eq!(roundtrip_string(r"C:\path\to\file"), r"C:\path\to\file");
    }

    #[test]
    fn test_string_roundtrip_mixed_escapes() {
        assert_eq!(
            roundtrip_string(r#"mix "quote" and \back\"#),
            r#"mix "quote" and \back\"#
        );
    }

    #[test]
    fn test_string_roundtrip_unicode() {
        assert_eq!(roundtrip_string("Kraków – Łódź"), "Kraków – Łódź");
        assert_eq!(roundtrip_string("トラック"), "トラック");
    }

    #[test]
    fn test_string_roundtrip_empty() {
        assert_eq!(roundtrip_string(""), "");
    }

    /// Hex-encoded floats (`&XXXXXXXX`) survive parse → serialize byte-exact.
    /// Decimal round-trip would drift the f32 bit pattern by one or two ulp,
    /// which is enough for the game's save loader to reject the file.
    #[test]
    fn hex_floats_roundtrip_byte_exact() {
        let input = "SiiNunit\n{\nbank : .b {\n payment_timer: &47806158\n game_time_secs: &41ae341b\n}\n\n}\n";
        let doc = parse_siin(input).unwrap();
        let out = serialize_siin(&doc);
        assert!(out.contains("payment_timer: &47806158"), "got: {out}");
        assert!(out.contains("game_time_secs: &41ae341b"), "got: {out}");
    }

    /// Vectors with hex components fall back to the raw text form so the
    /// `&XXXXXXXX` bits survive. SCS uses this for colors and dimensions.
    #[test]
    fn vector_with_hex_components_roundtrips_byte_exact() {
        let input = "SiiNunit\n{\nv : .v {\n base_color: (&3e843090, &3e843090, &3e843090)\n flake_color: (1, &3f0559b4, &3f11ff2e)\n}\n\n}\n";
        let doc = parse_siin(input).unwrap();
        let out = serialize_siin(&doc);
        assert!(
            out.contains("base_color: (&3e843090, &3e843090, &3e843090)"),
            "got: {out}"
        );
        assert!(
            out.contains("flake_color: (1, &3f0559b4, &3f11ff2e)"),
            "got: {out}"
        );
    }

    /// Integer-valued vector components keep their integer form. SCS writes
    /// `(0, 0, 0)`; emitting `(0.0, 0.0, 0.0)` causes load failures.
    #[test]
    fn integer_vector_components_no_decimal_suffix() {
        let input = "SiiNunit\n{\nv : .v {\n stored_pos: (2147483647, 2147483647, 2147483647)\n state: (0, 0)\n}\n\n}\n";
        let doc = parse_siin(input).unwrap();
        let out = serialize_siin(&doc);
        assert!(
            out.contains("stored_pos: (2147483647, 2147483647, 2147483647)"),
            "got: {out}"
        );
        assert!(out.contains("state: (0, 0)"), "got: {out}");
    }

    #[test]
    fn test_serialize_escaped_quote_has_backslash() {
        let doc = doc_with_one(SiiObject {
            class: "t".into(),
            id: ".t".into(),
            fields: vec![SiiField {
                name: "plate".into(),
                value: SiiValue::String(r#"ABC"X"#.into()),
            }],
        });
        let out = serialize_siin(&doc);
        assert!(out.contains(r#"plate: "ABC\"X""#), "serialized: {out}");
    }

    #[test]
    #[ignore] // requires real game save file
    fn test_roundtrip_real_game_sii() {
        let home = std::env::var("HOME").unwrap();
        let path = format!(
            "{}/Library/Application Support/American Truck Simulator/profiles/4A75737453747265737365644F7574/save/1/game.sii",
            home
        );
        if !std::path::Path::new(&path).exists() {
            eprintln!("Skipping: save file not found");
            return;
        }

        let data = std::fs::read(&path).unwrap();
        let decoded = sii_decode::file_type::decode_until_siin(&data).unwrap();
        let text = String::from_utf8(decoded).unwrap();

        let doc = parse_siin(&text).unwrap();
        let output = serialize_siin(&doc);

        // Re-parse and verify same number of objects
        let doc2 = parse_siin(&output).unwrap();
        assert_eq!(
            doc.objects.len(),
            doc2.objects.len(),
            "Object count mismatch after roundtrip"
        );

        eprintln!("Round-trip: {} objects preserved", doc.objects.len());
    }

    /// Strict text-level invariant: parsing the on-disk save and immediately
    /// re-serializing it must produce byte-identical output. Anything else is
    /// the corruption point — even one drifted character means the game's
    /// parser may reject the rewritten save. On mismatch, dumps both halves to
    /// `/tmp/sii_*.txt` and reports the first differing line.
    ///
    /// Run against a real save (decoded plaintext or the `.bak.original`
    /// snapshot the writer captures before its first edit):
    ///   SII_ROUNDTRIP_FILE=/path/to/game.sii.bak.original cargo test --lib \
    ///       --release -- --ignored verify_save_text_lossless --nocapture
    #[test]
    #[ignore]
    fn verify_save_text_lossless() {
        let path = match std::env::var("SII_ROUNDTRIP_FILE") {
            Ok(p) => p,
            Err(_) => {
                eprintln!("Skipping: set SII_ROUNDTRIP_FILE=/path/to/game.sii");
                return;
            }
        };
        let bytes = std::fs::read(&path).expect("read input");
        let decoded = sii_decode::file_type::decode_until_siin(&bytes).expect("decode failed");
        let original = String::from_utf8(decoded).expect("utf-8 from decoder");

        let doc = parse_siin(&original).expect("parse failed");
        let serialized = serialize_siin(&doc);

        if original == serialized {
            eprintln!("OK — {} bytes round-tripped byte-exact", original.len());
            return;
        }

        std::fs::write("/tmp/sii_original.txt", &original).unwrap();
        std::fs::write("/tmp/sii_serialized.txt", &serialized).unwrap();

        let orig_lines: Vec<&str> = original.lines().collect();
        let our_lines: Vec<&str> = serialized.lines().collect();
        let mut first_diff = None;
        for (i, (a, b)) in orig_lines.iter().zip(our_lines.iter()).enumerate() {
            if a != b {
                first_diff = Some(i);
                break;
            }
        }
        if first_diff.is_none() && orig_lines.len() != our_lines.len() {
            first_diff = Some(orig_lines.len().min(our_lines.len()));
        }
        if let Some(i) = first_diff {
            let lo = i.saturating_sub(2);
            let hi = (i + 5).min(orig_lines.len()).min(our_lines.len());
            eprintln!(
                "First text drift at line {} (orig has {} lines, ours has {})",
                i + 1,
                orig_lines.len(),
                our_lines.len()
            );
            for j in lo..hi {
                let marker = if j == i { ">>" } else { "  " };
                eprintln!("{marker} {:>4} orig: {:?}", j + 1, orig_lines.get(j));
                eprintln!("{marker} {:>4} ours: {:?}", j + 1, our_lines.get(j));
            }
        }
        panic!("text differs — see /tmp/sii_original.txt vs /tmp/sii_serialized.txt");
    }

    /// Strong proof of non-destructive round-trip: every object class+id, every
    /// field name+value must survive the serialize → re-parse cycle byte-exact.
    /// Catches drift in floats, hex floats, integer vectors, escape sequences,
    /// or any other value type that doesn't perfectly invert.
    ///
    /// Run against a known save by setting `SII_ROUNDTRIP_FILE` to its path:
    ///   SII_ROUNDTRIP_FILE=/path/to/game.sii cargo test --lib -- \
    ///       --ignored verify_save_lossless_roundtrip --nocapture
    ///
    /// Without the env var the test skips (no panic) so CI stays green.
    #[test]
    #[ignore]
    fn verify_save_lossless_roundtrip() {
        let path = match std::env::var("SII_ROUNDTRIP_FILE") {
            Ok(p) => p,
            Err(_) => {
                eprintln!("Skipping: set SII_ROUNDTRIP_FILE=/path/to/game.sii");
                return;
            }
        };
        if !std::path::Path::new(&path).exists() {
            eprintln!("Skipping: file not found at {path}");
            return;
        }

        let bytes = std::fs::read(&path).expect("read input");
        let format = crate::sii::detect_format(&bytes);
        eprintln!("Input format: {:?}", format);
        eprintln!("Input size:   {} bytes", bytes.len());

        let decoded = sii_decode::file_type::decode_until_siin(&bytes).expect("decode failed");
        let text = String::from_utf8(decoded).expect("utf-8 from decoder");
        let doc1 = parse_siin(&text).expect("parse #1");
        eprintln!("Objects:      {}", doc1.objects.len());

        let serialized = serialize_siin(&doc1);
        let doc2 = parse_siin(&serialized).expect("re-parse after serialize");

        assert_eq!(
            doc1.objects.len(),
            doc2.objects.len(),
            "object count drifted: {} → {}",
            doc1.objects.len(),
            doc2.objects.len()
        );

        let mut field_count = 0usize;
        let mut mismatches: Vec<String> = Vec::new();
        for (a, b) in doc1.objects.iter().zip(doc2.objects.iter()) {
            if a.class != b.class || a.id != b.id {
                mismatches.push(format!(
                    "object header drift: `{} : {}` → `{} : {}`",
                    a.class, a.id, b.class, b.id
                ));
                continue;
            }
            if a.fields.len() != b.fields.len() {
                mismatches.push(format!(
                    "{} : {}: field count {} → {}",
                    a.class,
                    a.id,
                    a.fields.len(),
                    b.fields.len()
                ));
            }
            for (fa, fb) in a.fields.iter().zip(b.fields.iter()) {
                field_count += 1;
                if fa.name != fb.name {
                    mismatches.push(format!(
                        "{} : {}: field name `{}` → `{}`",
                        a.class, a.id, fa.name, fb.name
                    ));
                }
                if fa.value != fb.value {
                    mismatches.push(format!(
                        "{} : {} . {}: value drift {:?} → {:?}",
                        a.class, a.id, fa.name, fa.value, fb.value
                    ));
                    if mismatches.len() > 20 {
                        mismatches.push("…(truncated)".into());
                        break;
                    }
                }
            }
        }
        eprintln!("Fields:       {field_count} compared");

        if !mismatches.is_empty() {
            for m in &mismatches {
                eprintln!("  MISMATCH: {m}");
            }
            panic!(
                "{} mismatches — writer would corrupt this save",
                mismatches.len()
            );
        }

        eprintln!("OK: every field round-tripped byte-exact.");
    }
}
