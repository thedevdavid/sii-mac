use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::save::models::{
    BankData, DriverData, EconomyData, GarageData, GarageStatus, PlayerData, SaveData, TrailerData,
    TruckData,
};
use crate::sii;
use crate::sii::parser::parse_siin;
use crate::sii::types::{SiiDocument, SiiObject, SiiValue};

/// Read and parse a game.sii save file into structured SaveData.
pub fn read_save(save_path: &str) -> Result<SaveData, AppError> {
    let game_sii = Path::new(save_path).join("game.sii");
    if !game_sii.exists() {
        return Err(AppError::NotFound(format!(
            "game.sii not found in {}",
            save_path
        )));
    }

    let data = fs::read(&game_sii)?;
    let text = sii::decode_sii_file(&data)?;
    let doc = parse_siin(&text).map_err(AppError::SiiDecode)?;

    extract_save_data(&doc)
}

/// Get the raw parsed SiiDocument for a save (used by writer).
pub fn read_save_document(save_path: &str) -> Result<SiiDocument, AppError> {
    let game_sii = Path::new(save_path).join("game.sii");
    let data = fs::read(&game_sii)?;
    let text = sii::decode_sii_file(&data)?;
    parse_siin(&text).map_err(AppError::SiiDecode)
}

fn extract_save_data(doc: &SiiDocument) -> Result<SaveData, AppError> {
    let economy = extract_economy(doc)?;
    let bank = extract_bank(doc, &economy.bank_id)?;
    let player = extract_player(doc, &economy.player_id)?;
    let trucks = extract_trucks(doc);
    let trailers = extract_trailers(doc);
    let garages = extract_garages(doc);
    let drivers = extract_drivers(doc);

    Ok(SaveData {
        economy,
        player,
        bank,
        trucks,
        trailers,
        garages,
        drivers,
    })
}

fn extract_economy(doc: &SiiDocument) -> Result<EconomyData, AppError> {
    let obj = doc
        .find_by_class("economy")
        .ok_or_else(|| AppError::SiiDecode("No economy object found".into()))?;

    let player_id = get_token_str(obj, "player")
        .ok_or_else(|| AppError::SiiDecode("Missing 'player' field in economy object".into()))?;
    let bank_id = get_token_str(obj, "bank")
        .ok_or_else(|| AppError::SiiDecode("Missing 'bank' field in economy object".into()))?;
    let game_time = obj.get_int("game_time");
    let company_count = obj.get_int("companies").unwrap_or(0) as usize;
    let experience_points = obj.get_int("experience_points");

    Ok(EconomyData {
        player_id,
        bank_id,
        game_time,
        company_count,
        experience_points,
    })
}

fn extract_bank(doc: &SiiDocument, bank_id: &str) -> Result<BankData, AppError> {
    let obj = doc
        .find_by_id(bank_id)
        .ok_or_else(|| AppError::SiiDecode(format!("Bank object not found: {bank_id}")))?;

    // money_account is a critical field: silently defaulting it to 0 would let
    // the user edit from "0" back to a real number, and the writer would then
    // overwrite the real value. Fail loudly instead.
    let money_account = obj.get_int("money_account").ok_or_else(|| {
        AppError::SiiDecode(format!(
            "bank `{bank_id}` is missing `money_account` field — refusing to load save to avoid silent data loss"
        ))
    })?;

    Ok(BankData {
        id: bank_id.to_string(),
        money_account,
        coinsurance_fixed: obj.get_int("coinsurance_fixed"),
        loan_limit: obj.get_int("loan_limit"),
        loan_count: obj.get_int("loans").unwrap_or(0) as usize,
        overdraft: matches!(obj.get("overdraft"), Some(SiiValue::Bool(true))),
    })
}

fn extract_player(doc: &SiiDocument, player_id: &str) -> Result<PlayerData, AppError> {
    let obj = doc
        .find_by_id(player_id)
        .ok_or_else(|| AppError::SiiDecode(format!("Player object not found: {}", player_id)))?;

    Ok(PlayerData {
        id: player_id.to_string(),
        hq_city: get_token_str(obj, "hq_city"),
        assigned_truck_id: get_token_str(obj, "assigned_truck"),
        assigned_trailer_id: get_token_str(obj, "assigned_trailer"),
        trailer_connected: matches!(
            obj.get("assigned_trailer_connected"),
            Some(SiiValue::Bool(true))
        ),
        driving_time: obj.get_int("driving_time"),
        sleeping_count: obj.get_int("sleeping_count"),
        free_roam_distance: obj.get_int("free_roam_distance"),
        discovery_distance: obj.get_float("discovary_distance"), // note: typo in game data
        flags: obj.get_int("flags"),
        current_job_id: get_token_str(obj, "current_job"),
    })
}

fn extract_trucks(doc: &SiiDocument) -> Vec<TruckData> {
    doc.find_all_by_class("vehicle")
        .into_iter()
        .map(|obj| {
            let brand_id = guess_truck_brand(obj, doc);
            let display_name = brand_id
                .as_ref()
                .map(|b| prettify_brand(b))
                .or_else(|| Some(obj.id.clone()));

            TruckData {
                id: obj.id.clone(),
                brand_id,
                display_name,
                fuel_relative: obj.get_float("fuel_relative").unwrap_or(0.0),
                engine_wear: obj.get_int("engine_wear").unwrap_or(0),
                transmission_wear: obj.get_int("transmission_wear").unwrap_or(0),
                cabin_wear: obj.get_int("cabin_wear").unwrap_or(0),
                chassis_wear: obj.get_int("chassis_wear").unwrap_or(0),
                engine_wear_unfixable: obj.get_int("engine_wear_unfixable").unwrap_or(0),
                transmission_wear_unfixable: obj
                    .get_int("transmission_wear_unfixable")
                    .unwrap_or(0),
                cabin_wear_unfixable: obj.get_int("cabin_wear_unfixable").unwrap_or(0),
                chassis_wear_unfixable: obj.get_int("chassis_wear_unfixable").unwrap_or(0),
                wheels_wear: extract_int_array(obj, "wheels_wear"),
                wheels_wear_unfixable: extract_int_array(obj, "wheels_wear_unfixable"),
                odometer: obj.get_int("odometer").unwrap_or(0),
                license_plate: obj.get_string("license_plate").map(|s| s.to_string()),
                accessory_count: obj.get_int("accessories").unwrap_or(0) as usize,
            }
        })
        .collect()
}

fn extract_trailers(doc: &SiiDocument) -> Vec<TrailerData> {
    doc.find_all_by_class("trailer")
        .into_iter()
        .map(|obj| {
            let trailer_def = get_token_str(obj, "trailer_definition");
            let display_name = trailer_def
                .as_ref()
                .map(|d| prettify_trailer_def(d))
                .or_else(|| Some(obj.id.clone()));

            TrailerData {
                id: obj.id.clone(),
                trailer_definition: trailer_def,
                display_name,
                cargo_mass: obj.get_float("cargo_mass").unwrap_or(0.0),
                cargo_damage: obj.get_int("cargo_damage").unwrap_or(0),
                is_private: matches!(obj.get("is_private"), Some(SiiValue::Bool(true))),
                body_wear: obj.get_int("trailer_body_wear").unwrap_or(0),
                body_wear_unfixable: obj.get_int("trailer_body_wear_unfixable").unwrap_or(0),
                chassis_wear: obj.get_int("chassis_wear").unwrap_or(0),
                chassis_wear_unfixable: obj.get_int("chassis_wear_unfixable").unwrap_or(0),
                odometer: obj.get_int("odometer").unwrap_or(0),
                license_plate: obj.get_string("license_plate").map(|s| s.to_string()),
                oversize: matches!(obj.get("oversize"), Some(SiiValue::Bool(true))),
                slave_trailer_id: get_token_str(obj, "slave_trailer"),
                accessory_count: obj.get_int("accessories").unwrap_or(0) as usize,
            }
        })
        .collect()
}

fn extract_garages(doc: &SiiDocument) -> Vec<GarageData> {
    doc.find_all_by_class("garage")
        .into_iter()
        .map(|obj| {
            let city_name = obj
                .id
                .strip_prefix("garage.")
                .unwrap_or(&obj.id)
                .to_string();

            GarageData {
                id: obj.id.clone(),
                city_name,
                status: GarageStatus::from_raw(obj.get_int("status").unwrap_or(0)),
                vehicle_count: obj.get_int("vehicles").unwrap_or(0) as usize,
                driver_count: obj.get_int("drivers").unwrap_or(0) as usize,
                trailer_count: obj.get_int("trailers").unwrap_or(0) as usize,
            }
        })
        .collect()
}

fn extract_drivers(doc: &SiiDocument) -> Vec<DriverData> {
    let mut drivers = Vec::new();

    // Player driver
    for obj in doc.find_all_by_class("driver_player") {
        drivers.push(DriverData {
            id: obj.id.clone(),
            is_player: true,
        });
    }

    // Hired drivers
    for obj in doc.find_all_by_class("driver") {
        drivers.push(DriverData {
            id: obj.id.clone(),
            is_player: false,
        });
    }

    drivers
}

// --- Helpers ---

fn get_token_str(obj: &SiiObject, name: &str) -> Option<String> {
    match obj.get(name) {
        Some(SiiValue::Token(s)) if s != "null" => Some(s.clone()),
        _ => None,
    }
}

fn extract_int_array(obj: &SiiObject, name: &str) -> Vec<i64> {
    let prefix = format!("{}[", name);
    obj.fields
        .iter()
        .filter(|f| f.name.starts_with(&prefix))
        .filter_map(|f| match &f.value {
            SiiValue::Integer(n) => Some(*n),
            _ => None,
        })
        .collect()
}

/// Extract truck brand from the first accessory's data_path (chassis).
/// The chassis accessory's data_path is like `/def/vehicle/truck/kenworth.w900/chassis/...`
fn guess_truck_brand(obj: &SiiObject, doc: &SiiDocument) -> Option<String> {
    // Get the first accessory reference
    let first_acc = obj.fields.iter().find(|f| f.name == "accessories[0]")?;
    let acc_id = match &first_acc.value {
        SiiValue::Token(s) if s != "null" => s.as_str(),
        _ => return None,
    };

    // Look up the accessory object
    let acc_obj = doc.find_by_id(acc_id)?;
    let data_path = acc_obj
        .get_string("data_path")
        .or_else(|| acc_obj.get_token("data_path"))?;

    // Parse brand from path like "/def/vehicle/truck/kenworth.w900/chassis/..."
    // or "/def/vehicle/truck/volvo.vnl_2018/..."
    let parts: Vec<&str> = data_path.split('/').collect();
    // Find the segment after "truck/" which contains "brand.model"
    for (i, part) in parts.iter().enumerate() {
        if *part == "truck" && i + 1 < parts.len() {
            let brand_model = parts[i + 1];
            // brand_model is like "kenworth.w900" or "volvo.vnl_2018"
            return Some(brand_model.replace(['.', '_'], " "));
        }
    }
    None
}

fn prettify_brand(brand: &str) -> String {
    brand
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().to_string() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn prettify_trailer_def(def: &str) -> String {
    // "trailer_def.scs.flatbed.single_53sp.flatbed" → "Flatbed (Single 53sp)"
    let parts: Vec<&str> = def.split('.').collect();
    if parts.len() >= 4 {
        let trailer_type = prettify_brand(parts[2]);
        let variant = prettify_brand(parts[3]);
        format!("{} ({})", trailer_type, variant)
    } else {
        def.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore] // requires real game save file
    fn test_read_real_save() {
        let home = std::env::var("HOME").unwrap();
        let save_path = format!(
            "{}/Library/Application Support/American Truck Simulator/profiles/4A75737453747265737365644F7574/save/1",
            home
        );
        if !Path::new(&save_path).join("game.sii").exists() {
            eprintln!("Skipping: save not found");
            return;
        }

        let save = read_save(&save_path).unwrap();

        eprintln!("\n=== SAVE DATA SUMMARY ===");
        eprintln!("Money: ${}", save.bank.money_account);
        eprintln!("Player HQ: {:?}", save.player.hq_city);
        eprintln!("Trucks: {}", save.trucks.len());
        eprintln!("Trailers: {}", save.trailers.len());
        eprintln!(
            "Garages: {} (owned: {})",
            save.garages.len(),
            save.garages
                .iter()
                .filter(|g| !matches!(g.status, GarageStatus::NotOwned))
                .count()
        );
        eprintln!("Drivers: {}", save.drivers.len());
        eprintln!("Companies: {}", save.economy.company_count);

        for (i, truck) in save.trucks.iter().enumerate() {
            eprintln!(
                "\nTruck {}: {} (fuel: {:.0}%, odometer: {} km, plate: {:?})",
                i,
                truck.display_name.as_deref().unwrap_or("Unknown"),
                truck.fuel_relative * 100.0,
                truck.odometer,
                truck.license_plate
            );
        }

        for (i, trailer) in save.trailers.iter().enumerate() {
            eprintln!(
                "Trailer {}: {} (cargo: {:.0} kg, plate: {:?})",
                i,
                trailer.display_name.as_deref().unwrap_or("Unknown"),
                trailer.cargo_mass,
                trailer.license_plate
            );
        }

        assert!(!save.trucks.is_empty(), "Should find trucks");
        assert!(!save.garages.is_empty(), "Should find garages");
    }
}

