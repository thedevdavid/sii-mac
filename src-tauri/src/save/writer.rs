//! Apply edits to game.sii and write back to disk.

use std::path::Path;

use crate::error::AppError;
use crate::save::models::{
    BulkAction, GarageChange, GarageStatus, PlayerChanges, TrailerChanges, TruckChanges,
};
use crate::save::reader::read_save_document;
use crate::sii::parser::parse_siin;
use crate::sii::types::{SiiDocument, SiiObject, SiiValue};
use crate::sii::writer::serialize_siin;
use crate::utils::atomic_replace_verified;

/// Read a save document, apply a mutation, and write it back.
///
/// Design note: each call performs a full decode → modify → serialize → write cycle,
/// even when only a single field changes. This is intentional. game.sii is a few
/// hundred KB on a local filesystem and the round-trip is well under 50 ms in
/// practice. Keeping the read/write boundary at the document level avoids any
/// shared mutable state between commands and guarantees that every write sees
/// a consistent on-disk view, including changes made by the game itself between
/// edits. The write path is atomic (see `write_save`).
fn with_save_doc<F>(save_path: &str, f: F) -> Result<(), AppError>
where
    F: FnOnce(&mut SiiDocument) -> Result<(), AppError>,
{
    let mut doc = read_save_document(save_path)?;
    f(&mut doc)?;
    write_save(save_path, &doc)
}

/// Write a modified SiiDocument back to disk as plaintext SiiNunit.
///
/// Uses [`atomic_replace_verified`] so the live `game.sii` only changes after
/// the new content has been fsync'd and re-parsed successfully. A `.bak`
/// snapshot of the previous file is kept for quick recovery.
fn write_save(save_path: &str, doc: &SiiDocument) -> Result<(), AppError> {
    let dir = Path::new(save_path);
    let game_sii = dir.join("game.sii");
    let backup = dir.join("game.sii.bak");

    let text = serialize_siin(doc);
    atomic_replace_verified(&game_sii, Some(&backup), text.as_bytes(), |t| {
        parse_siin(t)
            .map(|_| ())
            .map_err(|e| AppError::SiiDecode(format!("post-write verification failed: {e}")))
    })
}

// --- Shared vehicle helpers ---

/// Set all wear fields on a truck (vehicle) object to 0.
fn repair_vehicle(obj: &mut SiiObject) {
    for field in &[
        "engine_wear",
        "transmission_wear",
        "cabin_wear",
        "chassis_wear",
        "engine_wear_unfixable",
        "transmission_wear_unfixable",
        "cabin_wear_unfixable",
        "chassis_wear_unfixable",
    ] {
        obj.set(field, SiiValue::Integer(0));
    }
    zero_indexed_fields(obj, "wheels_wear");
    zero_indexed_fields(obj, "wheels_wear_unfixable");
}

/// Set fuel to full on a vehicle object.
fn refuel_vehicle(obj: &mut SiiObject) {
    obj.set("fuel_relative", SiiValue::Float(1.0));
}

/// Set all wear fields on a trailer object to 0.
fn repair_trailer_obj(obj: &mut SiiObject) {
    for field in &[
        "trailer_body_wear",
        "trailer_body_wear_unfixable",
        "chassis_wear",
        "chassis_wear_unfixable",
    ] {
        obj.set(field, SiiValue::Integer(0));
    }
}

fn zero_indexed_fields(obj: &mut SiiObject, name: &str) {
    let prefix = format!("{}[", name);
    for field in &mut obj.fields {
        if field.name.starts_with(&prefix) {
            field.value = SiiValue::Integer(0);
        }
    }
}

// --- Public edit functions ---

pub fn update_player(save_path: &str, changes: &PlayerChanges) -> Result<(), AppError> {
    with_save_doc(save_path, |doc| {
        if let Some(money) = changes.money {
            let bank_id = doc
                .find_by_class("economy")
                .and_then(|e| e.get_token("bank"))
                .map(|s| s.to_string());

            if let Some(bank_id) = bank_id {
                if let Some(bank) = doc.find_by_id_mut(&bank_id) {
                    bank.set("money_account", SiiValue::Integer(money));
                }
            }
        }

        Ok(())
    })
}

pub fn update_truck(
    save_path: &str,
    truck_id: &str,
    changes: &TruckChanges,
) -> Result<(), AppError> {
    with_save_doc(save_path, |doc| {
        let obj = doc
            .find_by_id_mut(truck_id)
            .ok_or_else(|| AppError::NotFound(format!("Truck not found: {}", truck_id)))?;

        if changes.repair == Some(true) {
            repair_vehicle(obj);
        } else {
            if let Some(v) = changes.engine_wear {
                obj.set("engine_wear", SiiValue::Integer(v));
            }
            if let Some(v) = changes.transmission_wear {
                obj.set("transmission_wear", SiiValue::Integer(v));
            }
            if let Some(v) = changes.cabin_wear {
                obj.set("cabin_wear", SiiValue::Integer(v));
            }
            if let Some(v) = changes.chassis_wear {
                obj.set("chassis_wear", SiiValue::Integer(v));
            }
        }

        if changes.refuel == Some(true) {
            refuel_vehicle(obj);
        } else if let Some(fuel) = changes.fuel_relative {
            obj.set("fuel_relative", SiiValue::Float(fuel));
        }

        if let Some(ref plate) = changes.license_plate {
            obj.set("license_plate", SiiValue::String(plate.clone()));
        }

        Ok(())
    })
}

pub fn update_all_trucks(save_path: &str, action: &BulkAction) -> Result<usize, AppError> {
    let mut doc = read_save_document(save_path)?;
    let mut count = 0;

    for obj in &mut doc.objects {
        if obj.class == "vehicle" {
            match action {
                BulkAction::RepairAll => repair_vehicle(obj),
                BulkAction::RefuelAll => refuel_vehicle(obj),
            }
            count += 1;
        }
    }

    write_save(save_path, &doc)?;
    Ok(count)
}

pub fn update_trailer(
    save_path: &str,
    trailer_id: &str,
    changes: &TrailerChanges,
) -> Result<(), AppError> {
    with_save_doc(save_path, |doc| {
        let obj = doc
            .find_by_id_mut(trailer_id)
            .ok_or_else(|| AppError::NotFound(format!("Trailer not found: {}", trailer_id)))?;

        if changes.repair == Some(true) {
            repair_trailer_obj(obj);
        } else {
            if let Some(v) = changes.body_wear {
                obj.set("trailer_body_wear", SiiValue::Integer(v));
            }
            if let Some(v) = changes.chassis_wear {
                obj.set("chassis_wear", SiiValue::Integer(v));
            }
        }

        if let Some(mass) = changes.cargo_mass {
            obj.set("cargo_mass", SiiValue::Float(mass));
        }
        if let Some(ref plate) = changes.license_plate {
            obj.set("license_plate", SiiValue::String(plate.clone()));
        }

        Ok(())
    })
}

pub fn update_all_trailers(save_path: &str) -> Result<usize, AppError> {
    let mut doc = read_save_document(save_path)?;
    let mut count = 0;

    for obj in &mut doc.objects {
        if obj.class == "trailer" {
            repair_trailer_obj(obj);
            count += 1;
        }
    }

    write_save(save_path, &doc)?;
    Ok(count)
}

pub fn update_garage(
    save_path: &str,
    garage_id: &str,
    change: &GarageChange,
) -> Result<(), AppError> {
    with_save_doc(save_path, |doc| {
        let obj = doc
            .find_by_id_mut(garage_id)
            .ok_or_else(|| AppError::NotFound(format!("Garage not found: {garage_id}")))?;
        obj.set("status", SiiValue::Integer(change.status.to_raw()));
        Ok(())
    })
}

pub fn unlock_all_garages(save_path: &str) -> Result<usize, AppError> {
    let mut doc = read_save_document(save_path)?;
    let mut count = 0;
    let tiny_raw = GarageStatus::Tiny.to_raw();
    let not_owned_raw = GarageStatus::NotOwned.to_raw();

    for obj in &mut doc.objects {
        if obj.class == "garage" && obj.get_int("status") == Some(not_owned_raw) {
            obj.set("status", SiiValue::Integer(tiny_raw));
            count += 1;
        }
    }

    write_save(save_path, &doc)?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sii::parser::parse_siin;

    fn make_vehicle_doc() -> SiiDocument {
        let text = r#"SiiNunit
{
vehicle : vehicle.test {
 engine_wear: 50
 transmission_wear: 30
 cabin_wear: 10
 chassis_wear: 20
 engine_wear_unfixable: 5
 transmission_wear_unfixable: 3
 cabin_wear_unfixable: 1
 chassis_wear_unfixable: 2
 wheels_wear: 2
 wheels_wear[0]: 10
 wheels_wear[1]: 15
 wheels_wear_unfixable: 2
 wheels_wear_unfixable[0]: 1
 wheels_wear_unfixable[1]: 2
 fuel_relative: 0.3
 license_plate: "ABC123"
}
}"#;
        parse_siin(text).unwrap()
    }

    #[test]
    fn test_repair_vehicle() {
        let mut doc = make_vehicle_doc();
        let obj = doc.find_by_id_mut("vehicle.test").unwrap();
        repair_vehicle(obj);

        assert_eq!(obj.get_int("engine_wear"), Some(0));
        assert_eq!(obj.get_int("transmission_wear"), Some(0));
        assert_eq!(obj.get_int("cabin_wear"), Some(0));
        assert_eq!(obj.get_int("chassis_wear"), Some(0));
        assert_eq!(obj.get_int("engine_wear_unfixable"), Some(0));
    }

    #[test]
    fn test_refuel_vehicle() {
        let mut doc = make_vehicle_doc();
        let obj = doc.find_by_id_mut("vehicle.test").unwrap();
        refuel_vehicle(obj);

        assert_eq!(obj.get_float("fuel_relative"), Some(1.0));
    }

    #[test]
    fn test_repair_trailer() {
        let text = r#"SiiNunit
{
trailer : trailer.test {
 trailer_body_wear: 40
 trailer_body_wear_unfixable: 5
 chassis_wear: 20
 chassis_wear_unfixable: 3
}
}"#;
        let mut doc = parse_siin(text).unwrap();
        let obj = doc.find_by_id_mut("trailer.test").unwrap();
        repair_trailer_obj(obj);

        assert_eq!(obj.get_int("trailer_body_wear"), Some(0));
        assert_eq!(obj.get_int("chassis_wear"), Some(0));
    }

    // --- End-to-end write path tests ---
    //
    // Use a real temp file + real write_save so the atomic-replace + re-parse
    // verification paths are exercised. Catches serializer regressions that
    // unit-only tests on in-memory SiiDocument would miss.

    fn write_sample_game_sii(dir: &std::path::Path, contents: &str) {
        std::fs::write(dir.join("game.sii"), contents).unwrap();
    }

    const SAMPLE_GAME_SII: &str = r#"SiiNunit
{
economy : .economy {
 player: player.1
 bank: bank.1
 companies: 5
}
player : player.1 {
 assigned_truck: null
 assigned_trailer: null
 assigned_trailer_connected: false
}
bank : bank.1 {
 money_account: 500000
 loans: 0
 overdraft: false
}
vehicle : vehicle.truck1 {
 engine_wear: 50000
 transmission_wear: 30000
 cabin_wear: 10000
 chassis_wear: 20000
 engine_wear_unfixable: 100
 transmission_wear_unfixable: 50
 cabin_wear_unfixable: 25
 chassis_wear_unfixable: 75
 fuel_relative: 0.3
 license_plate: "TEST 123"
 accessories: 0
 odometer: 100000
}
garage : garage.fresno {
 status: 0
 vehicles: 0
 drivers: 0
 trailers: 0
}
garage : garage.reno {
 status: 3
 vehicles: 2
 drivers: 1
 trailers: 2
}
}
"#;

    #[test]
    fn test_write_save_round_trip_preserves_money() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        write_sample_game_sii(dir, SAMPLE_GAME_SII);

        let save_path = dir.to_string_lossy().to_string();
        update_player(
            &save_path,
            &PlayerChanges {
                money: Some(9_000_000),
            },
        )
        .unwrap();

        let saved = crate::save::reader::read_save(&save_path).unwrap();
        assert_eq!(saved.bank.money_account, 9_000_000);
        assert!(dir.join("game.sii.bak").exists(), ".bak must be created");
    }

    #[test]
    fn test_write_save_preserves_plate_with_quotes() {
        // This exercises Phase 1.1: strings with embedded quotes must round-trip.
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        write_sample_game_sii(dir, SAMPLE_GAME_SII);

        let save_path = dir.to_string_lossy().to_string();
        update_truck(
            &save_path,
            "vehicle.truck1",
            &TruckChanges {
                fuel_relative: None,
                engine_wear: None,
                transmission_wear: None,
                cabin_wear: None,
                chassis_wear: None,
                license_plate: Some(r#"ABC"X"#.to_string()),
                repair: None,
                refuel: None,
            },
        )
        .unwrap();

        let saved = crate::save::reader::read_save(&save_path).unwrap();
        let truck = saved
            .trucks
            .iter()
            .find(|t| t.id == "vehicle.truck1")
            .unwrap();
        assert_eq!(truck.license_plate.as_deref(), Some(r#"ABC"X"#));
    }

    #[test]
    fn test_update_garage_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        write_sample_game_sii(dir, SAMPLE_GAME_SII);
        let save_path = dir.to_string_lossy().to_string();

        update_garage(
            &save_path,
            "garage.fresno",
            &GarageChange {
                status: GarageStatus::Large,
            },
        )
        .unwrap();

        let saved = crate::save::reader::read_save(&save_path).unwrap();
        let fresno = saved
            .garages
            .iter()
            .find(|g| g.id == "garage.fresno")
            .unwrap();
        assert_eq!(fresno.status, GarageStatus::Large);
    }

    #[test]
    fn test_unlock_all_garages_only_touches_not_owned() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        write_sample_game_sii(dir, SAMPLE_GAME_SII);
        let save_path = dir.to_string_lossy().to_string();

        let count = unlock_all_garages(&save_path).unwrap();
        assert_eq!(count, 1, "only fresno (status=0) should be unlocked");

        let saved = crate::save::reader::read_save(&save_path).unwrap();
        let fresno = saved
            .garages
            .iter()
            .find(|g| g.id == "garage.fresno")
            .unwrap();
        let reno = saved
            .garages
            .iter()
            .find(|g| g.id == "garage.reno")
            .unwrap();
        assert_eq!(fresno.status, GarageStatus::Tiny, "unlocked to Tiny");
        assert_eq!(reno.status, GarageStatus::Large, "existing Large untouched");
    }

    #[test]
    fn test_update_truck_not_found_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        write_sample_game_sii(dir, SAMPLE_GAME_SII);
        let save_path = dir.to_string_lossy().to_string();

        let result = update_truck(
            &save_path,
            "vehicle.does_not_exist",
            &TruckChanges {
                fuel_relative: None,
                engine_wear: None,
                transmission_wear: None,
                cabin_wear: None,
                chassis_wear: None,
                license_plate: Some("NEW".into()),
                repair: None,
                refuel: None,
            },
        );
        match result {
            Err(AppError::NotFound(msg)) => assert!(msg.contains("vehicle.does_not_exist")),
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn test_write_save_rejects_missing_money() {
        // Phase 2.3 fix: save reader must fail loudly if bank.money_account
        // is missing, so the writer can't silently roundtrip zero over real data.
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let bad_game_sii = r#"SiiNunit
{
economy : .economy {
 player: player.1
 bank: bank.1
 companies: 0
}
player : player.1 {
 assigned_truck: null
 assigned_trailer: null
 assigned_trailer_connected: false
}
bank : bank.1 {
 loans: 0
 overdraft: false
}
}
"#;
        write_sample_game_sii(dir, bad_game_sii);
        let save_path = dir.to_string_lossy().to_string();

        let result = crate::save::reader::read_save(&save_path);
        match result {
            Err(AppError::SiiDecode(msg)) => {
                assert!(msg.contains("money_account"), "got: {msg}");
            }
            other => panic!("expected SiiDecode, got {other:?}"),
        }
    }
}
