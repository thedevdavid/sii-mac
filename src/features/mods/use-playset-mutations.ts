import { useQueryClient } from "@tanstack/react-query";
import { useInvalidatingMutation } from "@/hooks/use-mutations";
import { queryKeys } from "@/lib/query-keys";
import type {
  GameBasePath,
  ModId,
  PlaysetId,
  ProfilePath,
} from "@/lib/core-types";
import {
  acceptPlaysetDrift,
  addModToPlayset,
  applyPlayset,
  createPlayset,
  deletePlayset,
  duplicatePlayset,
  exportPlayset,
  importPlayset,
  removeModFromPlayset,
  renamePlayset,
  reorderPlaysetEntries,
  saveActiveAsPlayset,
  setActivePlayset,
  setPlaysetEntries,
  toggleEntryEnabled,
  updatePlaysetMetadata,
} from "@/lib/tauri-commands";
import type {
  Playset,
  PlaysetEntry,
  PlaysetMetadataPatch,
} from "./types";

/**
 * Mutation hooks for the mod manager. Non-optimistic hooks use the
 * `useInvalidatingMutation` helper directly; optimistic hooks add
 * `onMutate`/`onError`/`onSettled` callbacks that apply a local cache edit
 * immediately and roll back on failure.
 *
 * All optimistic hooks target `playsets.active(profilePath)` because the
 * editor always shows the currently active playset. If the user is editing a
 * non-active playset (e.g. from the sidebar), the mutation still runs but
 * optimism is skipped and the invalidation refetches cleanly.
 */

// --- Non-optimistic ---

export function useCreatePlayset(basePath: GameBasePath | null | undefined) {
  return useInvalidatingMutation<Playset, { name: string }>({
    mutationFn: ({ name }) =>
      createPlayset(basePath as GameBasePath, name),
    invalidate: [queryKeys.playsets.list(basePath ?? "")],
    successToast: (playset) => `Playset "${playset.name}" created`,
    errorPrefix: "Create failed",
  });
}

export function useDuplicatePlayset(basePath: GameBasePath | null | undefined) {
  return useInvalidatingMutation<
    Playset,
    { playsetId: PlaysetId; newName: string }
  >({
    mutationFn: ({ playsetId, newName }) =>
      duplicatePlayset(basePath as GameBasePath, playsetId, newName),
    invalidate: [queryKeys.playsets.list(basePath ?? "")],
    successToast: (playset) => `Playset "${playset.name}" created`,
    errorPrefix: "Duplicate failed",
  });
}

export function useRenamePlayset(basePath: GameBasePath | null | undefined) {
  return useInvalidatingMutation<
    Playset,
    { playsetId: PlaysetId; newName: string }
  >({
    mutationFn: ({ playsetId, newName }) =>
      renamePlayset(basePath as GameBasePath, playsetId, newName),
    invalidate: [
      queryKeys.playsets.list(basePath ?? ""),
      ["playsets", "detail", basePath ?? ""],
      ["playsets", "active"],
    ],
    successToast: () => "Playset renamed",
    errorPrefix: "Rename failed",
  });
}

export function useUpdatePlaysetMetadata(
  basePath: GameBasePath | null | undefined,
) {
  return useInvalidatingMutation<
    Playset,
    { playsetId: PlaysetId; patch: PlaysetMetadataPatch }
  >({
    mutationFn: ({ playsetId, patch }) =>
      updatePlaysetMetadata(basePath as GameBasePath, playsetId, patch),
    invalidate: [
      queryKeys.playsets.list(basePath ?? ""),
      ["playsets", "detail", basePath ?? ""],
    ],
    errorPrefix: "Update failed",
  });
}

export function useDeletePlayset(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useInvalidatingMutation<void, { playsetId: PlaysetId }>({
    mutationFn: ({ playsetId }) =>
      deletePlayset(basePath as GameBasePath, playsetId),
    invalidate: [
      queryKeys.playsets.list(basePath ?? ""),
      queryKeys.playsets.active(profilePath ?? ""),
      ["playsets", "drift", profilePath ?? ""],
      ["playsets", "detail", basePath ?? ""],
    ],
    successToast: () => "Playset deleted",
    errorPrefix: "Delete failed",
  });
}

export function useSetActivePlayset(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useInvalidatingMutation<void, { playsetId: PlaysetId }>({
    mutationFn: ({ playsetId }) =>
      setActivePlayset(
        basePath as GameBasePath,
        profilePath as ProfilePath,
        playsetId,
      ),
    invalidate: [
      queryKeys.playsets.active(profilePath ?? ""),
      ["playsets", "drift", profilePath ?? ""],
    ],
    errorPrefix: "Activate failed",
  });
}

export function useApplyPlayset(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useInvalidatingMutation<
    unknown,
    { playsetId: PlaysetId; playsetName: string }
  >({
    mutationFn: ({ playsetId }) =>
      applyPlayset(
        basePath as GameBasePath,
        profilePath as ProfilePath,
        playsetId,
      ),
    invalidate: [
      queryKeys.profiles.detail(profilePath ?? ""),
      queryKeys.playsets.active(profilePath ?? ""),
      ["playsets", "drift", profilePath ?? ""],
    ],
    successToast: (_data, { playsetName }) => `Applied "${playsetName}"`,
    errorPrefix: "Apply failed",
  });
}

export function useSaveActiveAsPlayset(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useInvalidatingMutation<Playset, { name: string }>({
    mutationFn: ({ name }) =>
      saveActiveAsPlayset(
        basePath as GameBasePath,
        profilePath as ProfilePath,
        name,
      ),
    invalidate: [
      queryKeys.playsets.list(basePath ?? ""),
      queryKeys.playsets.active(profilePath ?? ""),
    ],
    successToast: (playset) => `Saved as "${playset.name}"`,
    errorPrefix: "Save failed",
  });
}

export function useAcceptPlaysetDrift(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useInvalidatingMutation<Playset, { playsetId: PlaysetId }>({
    mutationFn: ({ playsetId }) =>
      acceptPlaysetDrift(
        basePath as GameBasePath,
        profilePath as ProfilePath,
        playsetId,
      ),
    invalidate: [
      queryKeys.playsets.active(profilePath ?? ""),
      ["playsets", "drift", profilePath ?? ""],
    ],
    successToast: () => "Changes saved to playset",
    errorPrefix: "Save failed",
  });
}

export function useExportPlayset() {
  return useInvalidatingMutation<
    void,
    {
      basePath: GameBasePath;
      playsetId: PlaysetId;
      destinationPath: string;
      displayName: string;
    }
  >({
    mutationFn: ({ basePath, playsetId, destinationPath }) =>
      exportPlayset(basePath, playsetId, destinationPath),
    invalidate: [],
    successToast: (_data, { displayName }) => `Exported "${displayName}"`,
    errorPrefix: "Export failed",
  });
}

export function useImportPlayset(basePath: GameBasePath | null | undefined) {
  return useInvalidatingMutation<Playset, { sourcePath: string }>({
    mutationFn: ({ sourcePath }) =>
      importPlayset(basePath as GameBasePath, sourcePath),
    invalidate: [queryKeys.playsets.list(basePath ?? "")],
    successToast: (playset) => `Imported "${playset.name}"`,
    errorPrefix: "Import failed",
  });
}

// --- Optimistic ---

interface ActiveSnapshot {
  previous: Playset | undefined;
}

type OptimisticUpdater = (current: Playset) => Playset;

function useOptimisticActiveMutation<TVars>(config: {
  basePath: GameBasePath | null | undefined;
  profilePath: ProfilePath | null | undefined;
  mutationFn: (vars: TVars) => Promise<Playset>;
  apply: (vars: TVars) => OptimisticUpdater;
  successToast?: (data: Playset, vars: TVars) => string | null;
  errorPrefix?: string;
}) {
  const queryClient = useQueryClient();
  const activeKey = queryKeys.playsets.active(config.profilePath ?? "");
  const driftKeyPrefix = ["playsets", "drift", config.profilePath ?? ""];
  const listKey = queryKeys.playsets.list(config.basePath ?? "");

  return useInvalidatingMutation<Playset, TVars, ActiveSnapshot>({
    mutationFn: config.mutationFn,
    invalidate: [activeKey, driftKeyPrefix, listKey],
    successToast: config.successToast,
    errorPrefix: config.errorPrefix,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: activeKey });
      const previous = queryClient.getQueryData<Playset>(activeKey);
      if (previous) {
        const next = config.apply(vars)(previous);
        queryClient.setQueryData(activeKey, next);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(activeKey, context.previous);
      }
    },
  });
}

export function useToggleEntryEnabled(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useOptimisticActiveMutation<{ modId: ModId; enabled: boolean; playsetId: PlaysetId }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, modId, enabled }) =>
      toggleEntryEnabled(basePath as GameBasePath, playsetId, modId, enabled),
    apply: ({ modId, enabled }) => (current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.mod_id === modId ? { ...entry, enabled } : entry,
      ),
    }),
    errorPrefix: "Toggle failed",
  });
}

export function useAddModToPlayset(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useOptimisticActiveMutation<{
    playsetId: PlaysetId;
    modId: ModId;
    displayName: string;
  }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, modId, displayName }) =>
      addModToPlayset(basePath as GameBasePath, playsetId, modId, displayName),
    apply: ({ modId, displayName }) => (current) => ({
      ...current,
      entries: [
        ...current.entries,
        {
          mod_id: modId,
          display_name: displayName,
          enabled: true,
          order: current.entries.length,
        },
      ],
    }),
    successToast: (_data, { displayName }) => `Added ${displayName}`,
    errorPrefix: "Add failed",
  });
}

export function useRemoveModFromPlayset(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useOptimisticActiveMutation<{
    playsetId: PlaysetId;
    modId: ModId;
    displayName: string;
  }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, modId }) =>
      removeModFromPlayset(basePath as GameBasePath, playsetId, modId),
    apply: ({ modId }) => (current) => ({
      ...current,
      entries: current.entries
        .filter((entry) => entry.mod_id !== modId)
        .map((entry, index) => ({ ...entry, order: index })),
    }),
    successToast: (_data, { displayName }) => `Removed ${displayName}`,
    errorPrefix: "Remove failed",
  });
}

export function useReorderPlaysetEntries(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useOptimisticActiveMutation<{
    playsetId: PlaysetId;
    orderedModIds: ModId[];
  }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, orderedModIds }) =>
      reorderPlaysetEntries(
        basePath as GameBasePath,
        playsetId,
        orderedModIds,
      ),
    apply: ({ orderedModIds }) => (current) => {
      const byId = new Map(current.entries.map((e) => [e.mod_id, e]));
      const reordered = orderedModIds
        .map((id, index) => {
          const entry = byId.get(id);
          return entry ? { ...entry, order: index } : null;
        })
        .filter((entry): entry is PlaysetEntry => entry !== null);
      return { ...current, entries: reordered };
    },
    errorPrefix: "Reorder failed",
  });
}

export function useSetPlaysetEntries(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useOptimisticActiveMutation<{
    playsetId: PlaysetId;
    entries: PlaysetEntry[];
  }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, entries }) =>
      setPlaysetEntries(basePath as GameBasePath, playsetId, entries),
    apply: ({ entries }) => (current) => ({
      ...current,
      entries: entries.map((entry, index) => ({ ...entry, order: index })),
    }),
    errorPrefix: "Update failed",
  });
}
