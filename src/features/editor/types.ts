import { z } from "zod";
import {
  BankIdSchema,
  DriverIdSchema,
  GarageIdSchema,
  JobIdSchema,
  PlayerIdSchema,
  SafeIntSchema,
  TrailerIdSchema,
  TruckIdSchema,
} from "@/lib/core-types";

/**
 * Save-editor Zod schemas: the structured view of a decoded `game.sii` file
 * plus the mutation payloads the UI sends back to Rust.
 */

// ---------------------------------------------------------------------------
// Economy / player / bank (read side)
// ---------------------------------------------------------------------------

export const EconomyDataSchema = z.object({
  player_id: PlayerIdSchema,
  bank_id: BankIdSchema,
  game_time: z.number().nullish(),
  company_count: z.number(),
  experience_points: z.number().nullish(),
});
export type EconomyData = z.infer<typeof EconomyDataSchema>;

export const PlayerDataSchema = z.object({
  id: PlayerIdSchema,
  hq_city: z.string().nullish(),
  assigned_truck_id: TruckIdSchema.nullish(),
  assigned_trailer_id: TrailerIdSchema.nullish(),
  trailer_connected: z.boolean(),
  driving_time: z.number().nullish(),
  sleeping_count: z.number().nullish(),
  free_roam_distance: z.number().nullish(),
  discovery_distance: z.number().nullish(),
  flags: z.number().nullish(),
  current_job_id: JobIdSchema.nullish(),
});
export type PlayerData = z.infer<typeof PlayerDataSchema>;

export const BankDataSchema = z.object({
  id: BankIdSchema,
  // money_account is i64 in Rust — allows negative (overdraft). SafeIntSchema
  // ensures we don't silently round values that exceed Number.MAX_SAFE_INTEGER.
  money_account: SafeIntSchema,
  coinsurance_fixed: SafeIntSchema.nullish(),
  loan_limit: SafeIntSchema.nullish(),
  loan_count: z.number(),
  overdraft: z.boolean(),
});
export type BankData = z.infer<typeof BankDataSchema>;

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export const TruckDataSchema = z.object({
  id: TruckIdSchema,
  brand_id: z.string().nullish(),
  display_name: z.string().nullish(),
  fuel_relative: z.number(),
  engine_wear: z.number(),
  transmission_wear: z.number(),
  cabin_wear: z.number(),
  chassis_wear: z.number(),
  engine_wear_unfixable: z.number(),
  transmission_wear_unfixable: z.number(),
  cabin_wear_unfixable: z.number(),
  chassis_wear_unfixable: z.number(),
  wheels_wear: z.array(z.number()),
  wheels_wear_unfixable: z.array(z.number()),
  odometer: z.number(),
  license_plate: z.string().nullish(),
  accessory_count: z.number(),
});
export type TruckData = z.infer<typeof TruckDataSchema>;

export const TrailerDataSchema = z.object({
  id: TrailerIdSchema,
  trailer_definition: z.string().nullish(),
  display_name: z.string().nullish(),
  cargo_mass: z.number(),
  cargo_damage: z.number(),
  is_private: z.boolean(),
  body_wear: z.number(),
  body_wear_unfixable: z.number(),
  chassis_wear: z.number(),
  chassis_wear_unfixable: z.number(),
  odometer: z.number(),
  license_plate: z.string().nullish(),
  oversize: z.boolean(),
  slave_trailer_id: TrailerIdSchema.nullish(),
  accessory_count: z.number(),
});
export type TrailerData = z.infer<typeof TrailerDataSchema>;

// ---------------------------------------------------------------------------
// Garages
// ---------------------------------------------------------------------------

export const GarageStatusSchema = z.union([
  z.literal("notOwned"),
  z.literal("tiny"),
  z.literal("small"),
  z.literal("large"),
  z.object({ Unknown: z.number() }),
]);
export type GarageStatus = z.infer<typeof GarageStatusSchema>;

export function isGarageOwned(status: GarageStatus): boolean {
  return status !== "notOwned";
}

export const GarageDataSchema = z.object({
  id: GarageIdSchema,
  city_name: z.string(),
  status: GarageStatusSchema,
  vehicle_count: z.number(),
  driver_count: z.number(),
  trailer_count: z.number(),
});
export type GarageData = z.infer<typeof GarageDataSchema>;

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

export const DriverDataSchema = z.object({
  id: DriverIdSchema,
  is_player: z.boolean(),
});
export type DriverData = z.infer<typeof DriverDataSchema>;

// ---------------------------------------------------------------------------
// Top-level save data (response of `get_save_data`)
// ---------------------------------------------------------------------------

export const SaveFileFormatSchema = z.enum([
  "plaintext",
  "encrypted",
  "binaryBsii",
  "obfuscated3nK",
  "unknown",
]);
export type SaveFileFormat = z.infer<typeof SaveFileFormatSchema>;

export const SaveDataSchema = z.object({
  economy: EconomyDataSchema,
  player: PlayerDataSchema,
  bank: BankDataSchema,
  trucks: z.array(TruckDataSchema),
  trailers: z.array(TrailerDataSchema),
  garages: z.array(GarageDataSchema),
  drivers: z.array(DriverDataSchema),
  fileFormat: SaveFileFormatSchema,
});
export type SaveData = z.infer<typeof SaveDataSchema>;

// ---------------------------------------------------------------------------
// Mutation payloads
// ---------------------------------------------------------------------------
//
// Bounds match SCS semantics: wear fields are integers in 0..=1_000_000,
// fuel_relative is a fraction, license plates are short text. Money uses
// SafeIntSchema so a runaway UI value can't silently overflow.

const WEAR_MAX = 1_000_000;

export const PlayerChangesSchema = z.object({
  money: SafeIntSchema.optional(),
  experience: SafeIntSchema.optional(),
});
export type PlayerChanges = z.infer<typeof PlayerChangesSchema>;

export const TruckChangesSchema = z.object({
  fuel_relative: z.number().min(0).max(1).optional(),
  engine_wear: z.number().int().min(0).max(WEAR_MAX).optional(),
  transmission_wear: z.number().int().min(0).max(WEAR_MAX).optional(),
  cabin_wear: z.number().int().min(0).max(WEAR_MAX).optional(),
  chassis_wear: z.number().int().min(0).max(WEAR_MAX).optional(),
  license_plate: z.string().max(32).optional(),
  repair: z.boolean().optional(),
  refuel: z.boolean().optional(),
});
export type TruckChanges = z.infer<typeof TruckChangesSchema>;

export const TrailerChangesSchema = z.object({
  body_wear: z.number().int().min(0).max(WEAR_MAX).optional(),
  chassis_wear: z.number().int().min(0).max(WEAR_MAX).optional(),
  cargo_mass: z.number().min(0).optional(),
  license_plate: z.string().max(32).optional(),
  repair: z.boolean().optional(),
});
export type TrailerChanges = z.infer<typeof TrailerChangesSchema>;

export const GarageChangeSchema = z.object({
  status: GarageStatusSchema,
});
export type GarageChange = z.infer<typeof GarageChangeSchema>;

export const BulkActionSchema = z.enum(["RepairAll", "RefuelAll"]);
export type BulkAction = z.infer<typeof BulkActionSchema>;

// ---------------------------------------------------------------------------
// Mutation response payloads (returned from Rust commands so the React Query
// cache can be patched without a full save refetch)
// ---------------------------------------------------------------------------

export const PlayerUpdateResultSchema = z.object({
  player: PlayerDataSchema,
  bank: BankDataSchema,
  economy: EconomyDataSchema,
});
export type PlayerUpdateResult = z.infer<typeof PlayerUpdateResultSchema>;
