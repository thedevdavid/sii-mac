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
}

export function useInvalidatingMutation<TData = void, TVars = void, TContext = unknown>(
  opts: InvalidatingMutationOptions<TData, TVars, TContext>,
) {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVars, TContext>({
    ...opts,
    onSuccess: (data, vars, ctx) => {
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
    onError: (err) => {
      toast.error(`${opts.errorPrefix ?? "Failed"}: ${formatError(err)}`);
    },
  });
}

// --- Save editor mutations ---

export function useUpdatePlayerData(savePath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: { money?: number; experience?: number }) =>
      updatePlayerData(savePath, changes),
    onSuccess: () => {
      toast.success("Player data saved");
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
    },
    onError: (err) => toast.error(`Save failed: ${formatError(err)}`),
  });
}

export function useUpdateTruck(savePath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      truckId,
      changes,
    }: {
      truckId: string;
      changes: Parameters<typeof updateTruck>[2];
    }) => updateTruck(savePath, truckId, changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

export function useUpdateAllTrucks(savePath: string) {
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

export function useUpdateTrailer(savePath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      trailerId,
      changes,
    }: {
      trailerId: string;
      changes: Parameters<typeof updateTrailer>[2];
    }) => updateTrailer(savePath, trailerId, changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

export function useRepairAllTrailers(savePath: string) {
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

export function useUpdateGarage(savePath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      garageId,
      change,
    }: {
      garageId: string;
      change: { status: number };
    }) => updateGarage(savePath, garageId, change),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
    },
    onError: (err) => toast.error(`Failed: ${formatError(err)}`),
  });
}

export function useUnlockAllGarages(savePath: string) {
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

export function useUpdateGameConfig(gameBasePath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
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
