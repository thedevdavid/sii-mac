import type { TrailerData, TruckData } from "@/features/editor/types";

export function maxTruckWear(truck: TruckData): number {
  return Math.max(
    truck.engine_wear,
    truck.transmission_wear,
    truck.cabin_wear,
    truck.chassis_wear,
  );
}

export function maxTrailerWear(trailer: TrailerData): number {
  return Math.max(trailer.body_wear, trailer.chassis_wear);
}

export function wearLabel(wear: number): string {
  if (wear === 0) return "Perfect";
  if (wear < 10) return "Good";
  if (wear < 30) return "Worn";
  return "Damaged";
}

export type WearBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline";

export function wearVariant(wear: number): WearBadgeVariant {
  if (wear === 0) return "secondary";
  if (wear < 30) return "outline";
  return "destructive";
}
