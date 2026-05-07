use std::collections::HashMap;

/// A full SII document containing ordered objects with O(1) lookup indices.
#[derive(Debug, Clone, Default)]
pub struct SiiDocument {
    /// Ordered list of objects (preserves file order for round-trip fidelity).
    pub objects: Vec<SiiObject>,
    /// `id -> objects[idx]`. Built by `push_object` / `rebuild_index`.
    by_id: HashMap<String, usize>,
    /// `class -> [objects[idx], …]`. Built by `push_object` / `rebuild_index`.
    by_class: HashMap<String, Vec<usize>>,
}

/// A single SII object block like `economy : .economy { ... }`.
#[derive(Debug, Clone)]
pub struct SiiObject {
    /// Object class (e.g., "economy", "vehicle", "player", "garage")
    pub class: String,
    /// Object identifier (e.g., ".economy", "vehicle.storage.abc.123")
    pub id: String,
    /// Ordered fields (preserves file order).
    pub fields: Vec<SiiField>,
}

/// A single field within an SII object.
#[derive(Debug, Clone)]
pub struct SiiField {
    pub name: String,
    pub value: SiiValue,
}

/// Possible value types in SII files.
#[derive(Debug, Clone, PartialEq)]
pub enum SiiValue {
    /// Quoted string: `"hello world"`
    String(std::string::String),
    /// Unquoted token/reference: `vehicle.storage.abc`, `true`, `nil`, `owner`
    Token(std::string::String),
    /// Integer number: `42`, `-1`
    Integer(i64),
    /// Float number: `0.75`, `&3f400000` (hex-encoded float)
    Float(f64),
    /// Boolean: `true` / `false` (parsed from token context)
    Bool(bool),
    /// Nil/null value
    Nil,
    /// Placement: `(x; y; z) (w; x; y; z)` — position + quaternion rotation
    Placement {
        position: [f64; 3],
        rotation: [f64; 4],
    },
    /// Inline vector: `(x, y, z)` or `(x; y; z)`
    Vector(Vec<f64>),
}

impl SiiDocument {
    pub fn new() -> Self {
        Self::default()
    }

    /// Append an object and update indices in lockstep. Use this from any code
    /// path that grows the document (parser, synthetic builders) so `find_by_*`
    /// stays O(1).
    pub fn push_object(&mut self, obj: SiiObject) {
        let idx = self.objects.len();
        self.by_id.insert(obj.id.clone(), idx);
        self.by_class.entry(obj.class.clone()).or_default().push(idx);
        self.objects.push(obj);
    }

    /// Recompute both indices from `objects`. Call this if you mutate
    /// `objects` directly (rare — prefer `push_object`).
    #[allow(dead_code)]
    pub fn rebuild_index(&mut self) {
        self.by_id.clear();
        self.by_class.clear();
        self.by_id.reserve(self.objects.len());
        for (i, obj) in self.objects.iter().enumerate() {
            self.by_id.insert(obj.id.clone(), i);
            self.by_class.entry(obj.class.clone()).or_default().push(i);
        }
    }

    /// Find the first object with the given class name. O(1).
    pub fn find_by_class(&self, class: &str) -> Option<&SiiObject> {
        let idx = *self.by_class.get(class)?.first()?;
        self.objects.get(idx)
    }

    /// Find an object by its ID. O(1).
    pub fn find_by_id(&self, id: &str) -> Option<&SiiObject> {
        let idx = *self.by_id.get(id)?;
        self.objects.get(idx)
    }

    /// Find the first object with the given class name (mutable). O(1).
    pub fn find_by_class_mut(&mut self, class: &str) -> Option<&mut SiiObject> {
        let idx = *self.by_class.get(class)?.first()?;
        self.objects.get_mut(idx)
    }

    /// Find an object by its ID (mutable). O(1).
    pub fn find_by_id_mut(&mut self, id: &str) -> Option<&mut SiiObject> {
        let idx = *self.by_id.get(id)?;
        self.objects.get_mut(idx)
    }

    /// Find all objects with the given class name. O(k) where k is the bucket
    /// size.
    pub fn find_all_by_class(&self, class: &str) -> Vec<&SiiObject> {
        let Some(indices) = self.by_class.get(class) else {
            return Vec::new();
        };
        indices
            .iter()
            .filter_map(|&i| self.objects.get(i))
            .collect()
    }
}

impl SiiObject {
    /// Get a field value by name.
    pub fn get(&self, name: &str) -> Option<&SiiValue> {
        self.fields
            .iter()
            .find(|f| f.name == name)
            .map(|f| &f.value)
    }

    /// Get a string field value.
    pub fn get_string(&self, name: &str) -> Option<&str> {
        match self.get(name) {
            Some(SiiValue::String(s)) => Some(s),
            _ => None,
        }
    }

    /// Get a token field value.
    pub fn get_token(&self, name: &str) -> Option<&str> {
        match self.get(name) {
            Some(SiiValue::Token(s)) => Some(s),
            _ => None,
        }
    }

    /// Get an integer field value.
    pub fn get_int(&self, name: &str) -> Option<i64> {
        match self.get(name) {
            Some(SiiValue::Integer(n)) => Some(*n),
            _ => None,
        }
    }

    /// Get a float field value.
    pub fn get_float(&self, name: &str) -> Option<f64> {
        match self.get(name) {
            Some(SiiValue::Float(n)) => Some(*n),
            Some(SiiValue::Integer(n)) => Some(*n as f64),
            _ => None,
        }
    }

    /// Set a field value, replacing if exists or appending if not.
    pub fn set(&mut self, name: &str, value: SiiValue) {
        if let Some(field) = self.fields.iter_mut().find(|f| f.name == name) {
            field.value = value;
        } else {
            self.fields.push(SiiField {
                name: name.to_string(),
                value,
            });
        }
    }

    /// Replace a SCS-style indexed array (a `<name>: N` count field followed
    /// by `<name>[0] … <name>[N-1]` entries) in-place, preserving the original
    /// location of the array block within the field list.
    ///
    /// Used by profile clone and mod enable/disable so the rewrite logic lives
    /// in one place and both paths produce identical output.
    pub fn replace_indexed_array(&mut self, name: &str, entries: Vec<SiiValue>) {
        let entry_prefix = format!("{name}[");
        let insert_pos = self
            .fields
            .iter()
            .position(|f| f.name == name || f.name.starts_with(&entry_prefix))
            .unwrap_or(self.fields.len());

        self.fields
            .retain(|f| f.name != name && !f.name.starts_with(&entry_prefix));

        #[allow(clippy::cast_possible_wrap)]
        let count_value = SiiValue::Integer(entries.len() as i64);
        let mut new_fields: Vec<SiiField> = Vec::with_capacity(entries.len() + 1);
        new_fields.push(SiiField {
            name: name.to_string(),
            value: count_value,
        });
        for (i, value) in entries.into_iter().enumerate() {
            new_fields.push(SiiField {
                name: format!("{name}[{i}]"),
                value,
            });
        }

        let pos = insert_pos.min(self.fields.len());
        for (offset, field) in new_fields.into_iter().enumerate() {
            self.fields.insert(pos + offset, field);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obj(class: &str, id: &str) -> SiiObject {
        SiiObject {
            class: class.into(),
            id: id.into(),
            fields: Vec::new(),
        }
    }

    #[test]
    fn push_object_indexes_by_id_and_class() {
        let mut doc = SiiDocument::new();
        doc.push_object(obj("vehicle", "vehicle.a"));
        doc.push_object(obj("vehicle", "vehicle.b"));
        doc.push_object(obj("trailer", "trailer.a"));

        assert!(doc.find_by_id("vehicle.a").is_some());
        assert!(doc.find_by_id("vehicle.b").is_some());
        assert!(doc.find_by_id("trailer.a").is_some());
        assert!(doc.find_by_id("missing").is_none());
        assert_eq!(doc.find_all_by_class("vehicle").len(), 2);
        assert_eq!(doc.find_all_by_class("trailer").len(), 1);
        assert_eq!(doc.find_all_by_class("missing").len(), 0);
    }

    #[test]
    fn rebuild_index_recovers_after_direct_mutation() {
        let mut doc = SiiDocument::new();
        doc.objects.push(obj("vehicle", "vehicle.a"));
        // No push_object — indices are stale.
        assert!(doc.find_by_id("vehicle.a").is_none());
        doc.rebuild_index();
        assert!(doc.find_by_id("vehicle.a").is_some());
    }

    #[test]
    fn find_by_id_mut_uses_index() {
        let mut doc = SiiDocument::new();
        doc.push_object(obj("vehicle", "vehicle.a"));
        let target = doc.find_by_id_mut("vehicle.a").expect("should find");
        target.set("fuel_relative", SiiValue::Float(0.5));
        assert_eq!(
            doc.find_by_id("vehicle.a").and_then(|o| o.get_float("fuel_relative")),
            Some(0.5)
        );
    }
}
