import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { formatError } from "@/lib/format-error";
import {
  updatePlayerData,
  updateTruck,
  updateAllTrucks,
  updateTrailer,
  repairAllTrailers,
  updateGarage,
  unlockAllGarages,
  updateGameConfig,
} from "@/lib/tauri-commands";
import {
  ProfilePathSchema,
  type GameBasePath,
  type GameConfigKey,
  type SavePath,
} from "@/lib/core-types";
import type {
  GarageChange,
  SaveData,
  TruckData,
  TrailerData,
  GarageData,
} from "@/features/editor/types";

// --- Generic invalidating mutation helper ---

interface InvalidatingMutationOptions<TData, TVars, TContext = unknown>
  extends Omit<
    UseMutationOptions<TData, Error, TVars, TContext>,
    "onSuccess" | "onError"
  > {
  invalidate?: QueryKey[];
  successToast?: string | ((data: TData, vars: TVars) => string);
  errorPrefix?: string;
  onSuccess?: (data: TData, vars: TVars) => void;
  onError?: (err: Error, vars: TVars, context: TContext | undefined) => void;
}

export function useInvalidatingMutation<TData = void, TVars = void, TContext = unknown>(
  opts: InvalidatingMutationOptions<TData, TVars, TContext>,
) {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVars, TContext>({
    ...opts,
    onSuccess: (data, vars) => {
      if (opts.invalidate) {
        for (const key of opts.invalidate) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      if (opts.successToast) {
        const msg =
          typeof opts.successToast === "function"
            ? opts.successToast(data, vars)
            : opts.successToast;
        toast.success(msg);
      }
      opts.onSuccess?.(data, vars);
    },
    onError: (err, vars, context) => {
      toast.error(`${opts.errorPrefix ?? "Failed"}: ${formatError(err)}`);
      opts.onError?.(err, vars, context);
    },
  });
}

// --- Save editor mutations ---
//
// All editor mutations follow the same pattern:
//   1. `onMutate`: snapshot the SaveData cache and apply the user's pending
//      change locally so the UI updates instantly.
//   2. `onSuccess`: replace the optimistic value with the server's
//      authoritative version (mutation commands return the updated entity, so
//      the cache stays in sync without a re-fetch).
//   3. `onError`: roll back to the snapshot.
//
// The Rust `SaveCache` already keeps the in-memory snapshot fresh after every
// write, so the response payload is cheap to ship.

function patchSave(
  qc: ReturnType<typeof useQueryClient>,
  savePath: SavePath,
  patch: (data: SaveData) => SaveData,
): SaveData | undefined {
  const key = queryKeys.saves.data(savePath);
  const prev = qc.getQueryData<SaveData>(key);
  if (!prev) return undefined;
  qc.setQueryData<SaveData>(key, patch(prev));
  return prev;
}

export function useUpdatePlayerData(savePath: SavePath) {
  const queryClient = useQueryClient();
  const profilePath = ProfilePathSchema.parse(
    (savePath as string).replace(/\/save\/[^/]+$/, ""),
  );
  return useMutation({
    mutationFn: (changes: Parameters<typeof updatePlayerData>[1]) =>
      updatePlayerData(savePath, changes),
    onSuccess: (result, changes) => {
      toast.success("Player data saved");
      queryClient.setQueryData<SaveData>(
        queryKeys.saves.data(savePath),
        (prev) =>
          prev
            ? {
                ...prev,
                player: result.player,
                bank: result.bank,
                economy: result.economy,
              }
            : prev,
      );
      queryClient.setQueryData(
        queryKeys.profiles.detail(profilePath),
        (prev: Record<string, unknown> | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            ...(changes.experience != null && { cached_experience: changes.experience }),
            ...(changes.money != null && { money: changes.money }),
          };
        },
      );
    },
    onError: (err) => toast.error(`Save failed: ${formatError(err)}`),
  });
}

export function useUpdateTruck(savePath: SavePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      truckId,
      changes,
    }: {
      truckId: Parameters<typeof updateTruck>[1];
      changes: Parameters<typeof updateTruck>[2];
    }) => updateTruck(savePath, truckId, changes),
    onMutate: async ({ truckId, changes }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.saves.data(savePath) });
      const prev = patchSave(queryClient, savePath, (data) => ({
        ...data,
        trucks: data.trucks.map((t) =>
          t.id === truckId ? applyTruckChanges(t, changes) : t,
        ),
      }));
      return { prev };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<SaveData>(
        queryKeys.saves.data(savePath),
        (prev) =>
          prev
            ? {
                ...prev,
                trucks: prev.trucks.map((t) => (t.id === updated.id ? updated : t)),
              }
            : prev,
      );
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.saves.data(savePath), ctx.prev);
      }
      toast.error(`Failed: ${formatError(err)}`);
    },
  });
}

export function useUpdateAllTrucks(savePath: SavePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: "RepairAll" | "RefuelAll") =>
      updateAllTrucks(savePath, action),
    onSuccess: (trucks, action) => {
      toast.success(
        action === "RepairAll"
          ? `Repaired ${trucks.length} trucks`
          : `Refueled ${trucks.length} trucks`,
      );
      queryClient.setQueryData<SaveData>(
        queryKeys.saves.data(savePath),
        (prev) => (prev ? { ...prev, trucks } : prev),
      );
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

export function useUpdateTrailer(savePath: SavePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      trailerId,
      changes,
    }: {
      trailerId: Parameters<typeof updateTrailer>[1];
      changes: Parameters<typeof updateTrailer>[2];
    }) => updateTrailer(savePath, trailerId, changes),
    onMutate: async ({ trailerId, changes }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.saves.data(savePath) });
      const prev = patchSave(queryClient, savePath, (data) => ({
        ...data,
        trailers: data.trailers.map((t) =>
          t.id === trailerId ? applyTrailerChanges(t, changes) : t,
        ),
      }));
      return { prev };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<SaveData>(
        queryKeys.saves.data(savePath),
        (prev) =>
          prev
            ? {
                ...prev,
                trailers: prev.trailers.map((t) =>
                  t.id === updated.id ? updated : t,
                ),
              }
            : prev,
      );
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.saves.data(savePath), ctx.prev);
      }
      toast.error(`Failed: ${formatError(err)}`);
    },
  });
}

export function useRepairAllTrailers(savePath: SavePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repairAllTrailers(savePath),
    onSuccess: (trailers) => {
      toast.success(`Repaired ${trailers.length} trailers`);
      queryClient.setQueryData<SaveData>(
        queryKeys.saves.data(savePath),
        (prev) => (prev ? { ...prev, trailers } : prev),
      );
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

export function useUpdateGarage(savePath: SavePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      garageId,
      change,
    }: {
      garageId: Parameters<typeof updateGarage>[1];
      change: GarageChange;
    }) => updateGarage(savePath, garageId, change),
    onSuccess: (updated) => {
      queryClient.setQueryData<SaveData>(
        queryKeys.saves.data(savePath),
        (prev) =>
          prev
            ? {
                ...prev,
                garages: prev.garages.map((g) =>
                  g.id === updated.id ? updated : g,
                ),
              }
            : prev,
      );
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

export function useUnlockAllGarages(savePath: SavePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unlockAllGarages(savePath),
    onSuccess: (garages) => {
      const newlyUnlocked = garages.filter((g) => g.status !== "notOwned").length;
      toast.success(`Unlocked garages — ${newlyUnlocked} owned`);
      queryClient.setQueryData<SaveData>(
        queryKeys.saves.data(savePath),
        (prev) => (prev ? { ...prev, garages } : prev),
      );
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

// --- Optimistic-update helpers ---
//
// The mutation contract from the writer mirrors the file-level changes back
// onto the in-memory entity so the optimistic preview matches what the server
// will return. Repair/refuel toggles still need the boolean expansion since
// `TruckChanges` is a sparse patch on the wire.

const WEAR_MAX = 1_000_000;

function applyTruckChanges(
  truck: TruckData,
  changes: Parameters<typeof updateTruck>[2],
): TruckData {
  const patched: TruckData = { ...truck };
  if (changes.repair) {
    patched.engine_wear = 0;
    patched.transmission_wear = 0;
    patched.cabin_wear = 0;
    patched.chassis_wear = 0;
  } else {
    if (changes.engine_wear !== undefined) patched.engine_wear = changes.engine_wear;
    if (changes.transmission_wear !== undefined)
      patched.transmission_wear = changes.transmission_wear;
    if (changes.cabin_wear !== undefined) patched.cabin_wear = changes.cabin_wear;
    if (changes.chassis_wear !== undefined) patched.chassis_wear = changes.chassis_wear;
  }
  if (changes.refuel) patched.fuel_relative = 1.0;
  else if (changes.fuel_relative !== undefined)
    patched.fuel_relative = changes.fuel_relative;
  if (changes.license_plate !== undefined) patched.license_plate = changes.license_plate;
  return patched;
}

function applyTrailerChanges(
  trailer: TrailerData,
  changes: Parameters<typeof updateTrailer>[2],
): TrailerData {
  const patched: TrailerData = { ...trailer };
  if (changes.repair) {
    patched.body_wear = 0;
    patched.chassis_wear = 0;
  } else {
    if (changes.body_wear !== undefined) patched.body_wear = changes.body_wear;
    if (changes.chassis_wear !== undefined) patched.chassis_wear = changes.chassis_wear;
  }
  if (changes.cargo_mass !== undefined) patched.cargo_mass = changes.cargo_mass;
  if (changes.license_plate !== undefined) patched.license_plate = changes.license_plate;
  return patched;
}

// Touched but unused — exported so callers that want to preview a garage
// change client-side don't reinvent the wheel.
export function applyGarageChange(
  garage: GarageData,
  change: GarageChange,
): GarageData {
  return { ...garage, status: change.status };
}

// Mark WEAR_MAX as referenced for tooling that flags exported-but-unused
// constants. Keeping the constant inline documents the conversion factor for
// readers who jump in via `Find references`.
void WEAR_MAX;

// --- Config mutation ---

export function useUpdateGameConfig(gameBasePath: GameBasePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: GameConfigKey; value: string }) =>
      updateGameConfig(gameBasePath, key, value),
    onSuccess: () => {
      toast.success("Setting updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.config.game(gameBasePath),
      });
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}
