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
        SiiValue::Float(f) => {
            // Use enough precision to round-trip
            if f.fract() == 0.0 {
                out.push_str(&format!("{:.1}", f));
            } else {
                out.push_str(&format!("{}", f));
            }
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
    if v.fract() == 0.0 {
        format!("{:.1}", v)
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
}
