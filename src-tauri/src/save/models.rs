use serde::{Deserialize, Serialize};

/// Full save data extracted from game.sii for the editor UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveData {
    pub economy: EconomyData,
    pub player: PlayerData,
    pub bank: BankData,
    pub trucks: Vec<TruckData>,
    pub trailers: Vec<TrailerData>,
    pub garages: Vec<GarageData>,
    pub drivers: Vec<DriverData>,
    /// On-disk format of `game.sii` as detected from the file's magic bytes.
    /// One of: `"plaintext"` (SiiNunit), `"encrypted"` (ScsC), `"binaryBsii"`
    /// (BSII), `"obfuscated3nK"` (3nK), or `"unknown"`. Used for diagnostics
    /// only — the writer always emits plaintext SiiNunit, which the game
    /// loader accepts regardless of the value of `g_save_format`.
    #[serde(rename = "fileFormat")]
    pub file_format: String,
}

/// Economy root data from the `economy` object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EconomyData {
    /// Reference to the player object ID
    pub player_id: String,
    /// Reference to the bank object ID
    pub bank_id: String,
    /// Game time (in-game minutes)
    pub game_time: Option<i64>,
    /// Number of companies in the world
    pub company_count: usize,
    /// Total experience points
    pub experience_points: Option<i64>,
}

/// Player data from the `player` object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerData {
    /// SII object ID
    pub id: String,
    /// HQ city token
    pub hq_city: Option<String>,
    /// Reference to current truck vehicle ID
    pub assigned_truck_id: Option<String>,
    /// Reference to current trailer ID
    pub assigned_trailer_id: Option<String>,
    /// Whether trailer is connected
    pub trailer_connected: bool,
    /// In-game driving time (minutes)
    pub driving_time: Option<i64>,
    /// Number of sleep events
    pub sleeping_count: Option<i64>,
    /// Free roam distance
    pub free_roam_distance: Option<i64>,
    /// Discovery distance
    pub discovery_distance: Option<f64>,
    /// Player flags (bitfield)
    pub flags: Option<i64>,
    /// Current job reference
    pub current_job_id: Option<String>,
}

/// Bank/financial data from the `bank` object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankData {
    /// SII object ID
    pub id: String,
    /// Current money balance
    pub money_account: i64,
    /// Insurance fixed cost
    pub coinsurance_fixed: Option<i64>,
    /// Loan limit
    pub loan_limit: Option<i64>,
    /// Number of active loans
    pub loan_count: usize,
    /// Whether overdraft is active
    pub overdraft: bool,
}

/// Truck data from a `vehicle` object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TruckData {
    /// SII object ID
    pub id: String,
    /// Truck brand/model identifier extracted from accessories or object path
    pub brand_id: Option<String>,
    /// Human-readable truck name
    pub display_name: Option<String>,
    /// Fuel level (0.0 - 1.0)
    pub fuel_relative: f64,
    /// Engine wear (0 = new)
    pub engine_wear: i64,
    /// Transmission wear
    pub transmission_wear: i64,
    /// Cabin wear
    pub cabin_wear: i64,
    /// Chassis wear
    pub chassis_wear: i64,
    /// Unfixable engine wear
    pub engine_wear_unfixable: i64,
    /// Unfixable transmission wear
    pub transmission_wear_unfixable: i64,
    /// Unfixable cabin wear
    pub cabin_wear_unfixable: i64,
    /// Unfixable chassis wear
    pub chassis_wear_unfixable: i64,
    /// Wheel wear values
    pub wheels_wear: Vec<i64>,
    /// Unfixable wheel wear values
    pub wheels_wear_unfixable: Vec<i64>,
    /// Total distance driven (km)
    pub odometer: i64,
    /// License plate text (e.g., "60566RP|washington")
    pub license_plate: Option<String>,
    /// Number of accessories
    pub accessory_count: usize,
}

/// Trailer data from a `trailer` object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrailerData {
    /// SII object ID
    pub id: String,
    /// Trailer definition token (e.g., "trailer_def.scs.flatbed.single_53sp.flatbed")
    pub trailer_definition: Option<String>,
    /// Human-readable trailer type
    pub display_name: Option<String>,
    /// Cargo mass (kg)
    pub cargo_mass: f64,
    /// Cargo damage (0 = undamaged)
    pub cargo_damage: i64,
    /// Whether trailer is private (owned)
    pub is_private: bool,
    /// Body wear
    pub body_wear: i64,
    /// Unfixable body wear
    pub body_wear_unfixable: i64,
    /// Chassis wear
    pub chassis_wear: i64,
    /// Unfixable chassis wear
    pub chassis_wear_unfixable: i64,
    /// Total distance
    pub odometer: i64,
    /// License plate
    pub license_plate: Option<String>,
    /// Oversize flag
    pub oversize: bool,
    /// Reference to slave trailer (for doubles)
    pub slave_trailer_id: Option<String>,
    /// Number of accessories
    pub accessory_count: usize,
}

/// Garage status as stored in `game.sii`.
///
/// Maps the SCS raw integer to a named variant so magic numbers don't leak
/// into the UI layer. `Unknown` preserves any future values SCS might add.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GarageStatus {
    NotOwned,
    Tiny,
    Small,
    Large,
    Unknown(i64),
}

impl GarageStatus {
    pub fn from_raw(raw: i64) -> Self {
        match raw {
            0 => Self::NotOwned,
            6 => Self::Tiny,
            2 => Self::Small,
            3 => Self::Large,
            other => Self::Unknown(other),
        }
    }

    pub fn to_raw(self) -> i64 {
        match self {
            Self::NotOwned => 0,
            Self::Tiny => 6,
            Self::Small => 2,
            Self::Large => 3,
            Self::Unknown(n) => n,
        }
    }
}

/// Garage data from a `garage` object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GarageData {
    /// SII object ID (e.g., "garage.fresno")
    pub id: String,
    /// City name extracted from ID
    pub city_name: String,
    /// Named garage status instead of a raw integer.
    pub status: GarageStatus,
    /// Number of vehicle slots
    pub vehicle_count: usize,
    /// Number of driver slots
    pub driver_count: usize,
    /// Number of trailer slots
    pub trailer_count: usize,
}

/// Driver data from a `driver` or `driver_player` object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverData {
    /// SII object ID
    pub id: String,
    /// Whether this is the player driver
    pub is_player: bool,
}

/// Changes to apply to player data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerChanges {
    pub money: Option<i64>,
    pub experience: Option<i64>,
}

/// Changes to apply to a truck.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TruckChanges {
    pub fuel_relative: Option<f64>,
    pub engine_wear: Option<i64>,
    pub transmission_wear: Option<i64>,
    pub cabin_wear: Option<i64>,
    pub chassis_wear: Option<i64>,
    pub license_plate: Option<String>,
    /// Set all wear to 0
    pub repair: Option<bool>,
    /// Set fuel to 1.0
    pub refuel: Option<bool>,
}

/// Changes to apply to a trailer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrailerChanges {
    pub body_wear: Option<i64>,
    pub chassis_wear: Option<i64>,
    pub cargo_mass: Option<f64>,
    pub license_plate: Option<String>,
    pub repair: Option<bool>,
}

/// Bulk actions for all trucks/trailers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BulkAction {
    RepairAll,
    RefuelAll,
}

/// Garage status change.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GarageChange {
    pub status: GarageStatus,
}
