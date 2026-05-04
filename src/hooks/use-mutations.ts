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
import type { GarageChange } from "@/features/editor/types";

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

export function useUpdatePlayerData(savePath: SavePath) {
  const queryClient = useQueryClient();
  const profilePath = ProfilePathSchema.parse(
    (savePath as string).replace(/\/save\/[^/]+$/, ""),
  );
  return useMutation({
    mutationFn: (changes: Parameters<typeof updatePlayerData>[1]) =>
      updatePlayerData(savePath, changes),
    onSuccess: (_data, changes) => {
      toast.success("Player data saved");
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

export function useUpdateAllTrucks(savePath: SavePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: "RepairAll" | "RefuelAll") =>
      updateAllTrucks(savePath, action),
    onSuccess: (count, action) => {
      toast.success(
        action === "RepairAll"
          ? `Repaired ${count} trucks`
          : `Refueled ${count} trucks`,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

export function useRepairAllTrailers(savePath: SavePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repairAllTrailers(savePath),
    onSuccess: (count) => {
      toast.success(`Repaired ${count} trailers`);
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

export function useUnlockAllGarages(savePath: SavePath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unlockAllGarages(savePath),
    onSuccess: (count) => {
      toast.success(`Unlocked ${count} garages`);
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

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
