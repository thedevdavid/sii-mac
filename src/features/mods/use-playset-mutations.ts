import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useInvalidatingMutation } from "@/hooks/use-mutations";
import { formatError } from "@/lib/format-error";
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
  setEntriesLockGroup,
  saveActiveAsPlayset,
  setActivePlayset,
  toggleEntryEnabled,
  toggleEntryLocked,
  updatePlaysetMetadata,
} from "@/lib/tauri-commands";
import type { Playset, PlaysetMetadataPatch } from "./types";

// Prefix-only keys invalidate every matching subtree (e.g. all active-playset
// queries for a base path). Always go through `queryKeys` so key shape stays
// owned by `src/lib/query-keys.ts`.

const listKey = (basePath: GameBasePath | null | undefined) =>
  queryKeys.playsets.list(basePath ?? "");

const activeKey = (
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) => queryKeys.playsets.active(basePath ?? "", profilePath ?? "");

const detailPrefix = (basePath: GameBasePath | null | undefined) =>
  queryKeys.playsets.detailPrefix(basePath ?? "");

const activePrefix = (basePath: GameBasePath | null | undefined) =>
  queryKeys.playsets.activePrefix(basePath ?? "");

const driftPrefix = (
  basePath: GameBasePath | null | undefined,
  profilePath?: ProfilePath | null | undefined,
) =>
  profilePath !== undefined
    ? queryKeys.playsets.driftPrefix(basePath ?? "", profilePath ?? "")
    : queryKeys.playsets.driftPrefix(basePath ?? "");

// --- Optimistic helper for entry-level edits on the active playset ---

function useOptimisticPlaysetMutation<TVars>(config: {
  basePath: GameBasePath | null | undefined;
  profilePath: ProfilePath | null | undefined;
  mutationFn: (vars: TVars) => Promise<Playset>;
  apply: (current: Playset, vars: TVars) => Playset;
  successToast?: (data: Playset, vars: TVars) => string;
  errorPrefix?: string;
}) {
  const queryClient = useQueryClient();
  const aKey = activeKey(config.basePath, config.profilePath);
  return useInvalidatingMutation<Playset, TVars, { previous: Playset | undefined }>({
    mutationFn: config.mutationFn,
    invalidate: [
      aKey,
      listKey(config.basePath),
      driftPrefix(config.basePath, config.profilePath),
    ],
    successToast: config.successToast,
    errorPrefix: config.errorPrefix,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: aKey });
      const previous = queryClient.getQueryData<Playset>(aKey);
      if (previous) {
        queryClient.setQueryData(aKey, config.apply(previous, vars));
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(aKey, context.previous);
      }
    },
  });
}

// --- Playset CRUD ---

export function useCreatePlayset(basePath: GameBasePath | null | undefined) {
  return useInvalidatingMutation<Playset, { name: string }>({
    mutationFn: ({ name }) => createPlayset(basePath as GameBasePath, name),
    invalidate: [listKey(basePath)],
    successToast: (p) => `Playset "${p.name}" created`,
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
    invalidate: [listKey(basePath)],
    successToast: (p) => `Playset "${p.name}" created`,
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
      listKey(basePath),
      detailPrefix(basePath),
      activePrefix(basePath),
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
      listKey(basePath),
      detailPrefix(basePath),
      activePrefix(basePath),
    ],
    errorPrefix: "Update failed",
  });
}

export function useDeletePlayset(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  const queryClient = useQueryClient();
  const lKey = listKey(basePath);
  return useInvalidatingMutation<
    void,
    { playsetId: PlaysetId },
    { previous: Playset[] | undefined }
  >({
    mutationFn: ({ playsetId }) =>
      deletePlayset(basePath as GameBasePath, playsetId),
    invalidate: [
      detailPrefix(basePath),
      activeKey(basePath, profilePath),
      driftPrefix(basePath, profilePath),
    ],
    successToast: () => "Playset deleted",
    errorPrefix: "Delete failed",
    onMutate: async ({ playsetId }) => {
      // Optimistically remove from the sidebar list so the row disappears the
      // instant the user confirms. The server is authoritative; on error we
      // restore the snapshot.
      await queryClient.cancelQueries({ queryKey: lKey });
      const previous = queryClient.getQueryData<Playset[]>(lKey);
      if (previous) {
        queryClient.setQueryData<Playset[]>(
          lKey,
          previous.filter((p) => p.id !== playsetId),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(lKey, context.previous);
      }
    },
    onSuccess: () => {
      // Reconcile with server state in case anything else changed (e.g.
      // ensure_live_temp_playset side effects).
      queryClient.invalidateQueries({ queryKey: lKey });
    },
  });
}

// --- Profile-scoped save flows ---

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
      activeKey(basePath, profilePath),
      driftPrefix(basePath, profilePath),
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
      activeKey(basePath, profilePath),
      driftPrefix(basePath, profilePath),
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
    invalidate: [listKey(basePath), activeKey(basePath, profilePath)],
    successToast: (p) => `Saved as "${p.name}"`,
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
      activeKey(basePath, profilePath),
      driftPrefix(basePath, profilePath),
    ],
    successToast: () => "Changes saved to playset",
    errorPrefix: "Save failed",
  });
}

// --- Import / Export (dialog folded in) ---

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "playset";
}

export function useImportPlayset(basePath: GameBasePath | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Playset | null> => {
      const source = await openDialog({
        multiple: false,
        filters: [{ name: "Playset", extensions: ["json"] }],
      });
      if (!source || Array.isArray(source)) return null;
      return importPlayset(basePath as GameBasePath, source);
    },
    onSuccess: (playset) => {
      if (!playset) return;
      queryClient.invalidateQueries({ queryKey: listKey(basePath) });
      toast.success(`Imported "${playset.name}"`);
    },
    onError: (err) => toast.error(`Import failed: ${formatError(err)}`),
  });
}

export function useExportPlayset(basePath: GameBasePath | null | undefined) {
  return useMutation({
    mutationFn: async ({
      playsetId,
      defaultName,
    }: {
      playsetId: PlaysetId;
      defaultName: string;
    }): Promise<{ name: string } | null> => {
      const destination = await saveDialog({
        defaultPath: `${sanitizeFilename(defaultName)}.json`,
        filters: [{ name: "Playset", extensions: ["json"] }],
      });
      if (!destination) return null;
      await exportPlayset(basePath as GameBasePath, playsetId, destination);
      return { name: defaultName };
    },
    onSuccess: (result) => {
      if (!result) return;
      toast.success(`Exported "${result.name}"`);
    },
    onError: (err) => toast.error(`Export failed: ${formatError(err)}`),
  });
}

// --- Optimistic entry edits ---

export function useToggleEntryEnabled(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useOptimisticPlaysetMutation<{
    playsetId: PlaysetId;
    modId: ModId;
    enabled: boolean;
  }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, modId, enabled }) =>
      toggleEntryEnabled(basePath as GameBasePath, playsetId, modId, enabled),
    apply: (current, { modId, enabled }) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.mod_id === modId ? { ...entry, enabled } : entry,
      ),
    }),
    errorPrefix: "Toggle failed",
  });
}

export function useToggleEntryLocked(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useOptimisticPlaysetMutation<{
    playsetId: PlaysetId;
    modId: ModId;
    locked: boolean;
  }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, modId, locked }) =>
      toggleEntryLocked(basePath as GameBasePath, playsetId, modId, locked),
    apply: (current, { modId, locked }) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.mod_id === modId ? { ...entry, locked } : entry,
      ),
    }),
    errorPrefix: "Lock toggle failed",
  });
}

export function useAddModToPlayset(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useOptimisticPlaysetMutation<{
    playsetId: PlaysetId;
    modId: ModId;
    displayName: string;
  }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, modId, displayName }) =>
      addModToPlayset(basePath as GameBasePath, playsetId, modId, displayName),
    apply: (current, { modId, displayName }) => ({
      ...current,
      entries: [
        ...current.entries,
        {
          mod_id: modId,
          display_name: displayName,
          enabled: true,
          order: current.entries.length,
          locked: false,
          lock_group: null,
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
  return useOptimisticPlaysetMutation<{
    playsetId: PlaysetId;
    modId: ModId;
    displayName: string;
  }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, modId }) =>
      removeModFromPlayset(basePath as GameBasePath, playsetId, modId),
    apply: (current, { modId }) => ({
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
  return useOptimisticPlaysetMutation<{
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
    apply: (current, { orderedModIds }) => {
      const byId = new Map(current.entries.map((e) => [e.mod_id, e]));
      const reordered = orderedModIds
        .map((id, index) => {
          const entry = byId.get(id);
          return entry ? { ...entry, order: index } : null;
        })
        .filter((entry) => entry !== null);
      return { ...current, entries: reordered };
    },
    errorPrefix: "Reorder failed",
  });
}

export function useSetEntriesLockGroup(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useOptimisticPlaysetMutation<{
    playsetId: PlaysetId;
    modIds: ModId[];
    lockGroup: string | null;
  }>({
    basePath,
    profilePath,
    mutationFn: ({ playsetId, modIds, lockGroup }) =>
      setEntriesLockGroup(
        basePath as GameBasePath,
        playsetId,
        modIds,
        lockGroup,
      ),
    apply: (current, { modIds, lockGroup }) => {
      const targets = new Set(modIds);
      return {
        ...current,
        entries: current.entries.map((entry) =>
          targets.has(entry.mod_id as ModId)
            ? { ...entry, lock_group: lockGroup }
            : entry,
        ),
      };
    },
    successToast: (_data, { lockGroup, modIds }) =>
      lockGroup
        ? `Grouped ${modIds.length} mod${modIds.length === 1 ? "" : "s"}`
        : `Ungrouped ${modIds.length} mod${modIds.length === 1 ? "" : "s"}`,
    errorPrefix: "Group change failed",
  });
}
