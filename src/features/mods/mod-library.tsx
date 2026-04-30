import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/cupertino/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import type { GameBasePath } from "@/lib/core-types";
import type { Playset } from "./types";
import { ModLibraryRow } from "./mod-library-row";
import { useInstallationMods, useWorkshopMetadata } from "./use-playsets";
import {
  useAddModToPlayset,
  useRemoveModFromPlayset,
} from "./use-playset-mutations";
import {
  extractWorkshopIds,
  mergeWorkshopMetadata,
  type EnrichedMod,
} from "./workshop-metadata";
import type { FullModInfo } from "./types";

interface ModLibraryProps {
  basePath: GameBasePath;
  activePlayset: Playset | undefined;
  onShowDetails: (mod: EnrichedMod) => void;
  profilePath: string;
}

/** Estimated row height in px — used by the virtualizer to size the scroller. */
const ROW_HEIGHT = 56;

export function ModLibrary({
  basePath,
  activePlayset,
  onShowDetails,
}: ModLibraryProps) {
  const { data: mods, isLoading } = useInstallationMods(basePath);
  const workshopIds = extractWorkshopIds(mods ?? []);
  const { data: workshopMap } = useWorkshopMetadata(basePath, workshopIds);

  const addMutation = useAddModToPlayset(basePath, undefined);
  const removeMutation = useRemoveModFromPlayset(basePath, undefined);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [hideAdded, setHideAdded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const playsetModIds = new Set(
    activePlayset?.entries.map((e) => e.mod_id) ?? [],
  );

  const allMods: EnrichedMod[] = (mods ?? []).map((m) =>
    mergeWorkshopMetadata(m, workshopMap),
  );

  const filtered = filterMods(allMods, {
    search,
    sourceFilter,
    categoryFilter,
    hideAdded,
    playsetModIds,
  });

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
    getItemKey: (index) => filtered[index]?.id ?? index,
  });

  const allCategories = [
    ...new Set((mods ?? []).flatMap((m) => m.categories)),
  ].sort();
  const categoryOptions = allCategories.map((c) => ({
    label: c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " "),
    value: c,
    count: (mods ?? []).filter((m) => m.categories.includes(c)).length,
  }));
  const sourceOptions = [
    {
      label: "Workshop",
      value: "workshop",
      count: (mods ?? []).filter((m) => m.source === "workshop").length,
    },
    {
      label: "Local",
      value: "local",
      count: (mods ?? []).filter((m) => m.source === "local").length,
    },
  ].filter((o) => o.count > 0);

  const handleToggleInPlayset = (mod: FullModInfo) => {
    if (!activePlayset) return;
    if (playsetModIds.has(mod.id)) {
      removeMutation.mutate({
        playsetId: activePlayset.id,
        modId: mod.id,
        displayName: mod.display_name,
      });
    } else {
      addMutation.mutate({
        playsetId: activePlayset.id,
        modId: mod.id,
        displayName: mod.display_name,
      });
    }
  };

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold">
            Mod Library
            <span className="ml-1 text-muted-foreground">
              ({filtered.length} / {allMods.length})
            </span>
          </h2>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search mods..."
          className="h-7 text-xs"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {sourceOptions.length > 1 && (
            <DataTableFacetedFilter
              title="Source"
              options={sourceOptions}
              selected={sourceFilter}
              onSelectionChange={setSourceFilter}
            />
          )}
          {categoryOptions.length > 0 && (
            <DataTableFacetedFilter
              title="Category"
              options={categoryOptions}
              selected={categoryFilter}
              onSelectionChange={setCategoryFilter}
            />
          )}
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={hideAdded}
              onChange={(e) => setHideAdded(e.target.checked)}
              className="size-3"
            />
            Hide already added
          </label>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-1 p-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {search ? "No mods match your search" : "No mods found"}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualRow) => {
              const mod = filtered[virtualRow.index];
              if (!mod) return null;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full px-2"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ModLibraryRow
                    mod={mod}
                    isInPlayset={playsetModIds.has(mod.id)}
                    onToggleInPlayset={() => handleToggleInPlayset(mod)}
                    onViewDetails={() => onShowDetails(mod)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

interface FilterOptions {
  search: string;
  sourceFilter: Set<string>;
  categoryFilter: Set<string>;
  hideAdded: boolean;
  playsetModIds: Set<string>;
}

function filterMods(
  mods: EnrichedMod[],
  { search, sourceFilter, categoryFilter, hideAdded, playsetModIds }: FilterOptions,
): EnrichedMod[] {
  const lowerSearch = search.toLowerCase().trim();
  return mods.filter((mod) => {
    if (hideAdded && playsetModIds.has(mod.id)) return false;
    if (sourceFilter.size > 0 && !sourceFilter.has(mod.source)) return false;
    if (
      categoryFilter.size > 0 &&
      !mod.categories.some((c) => categoryFilter.has(c))
    )
      return false;
    if (lowerSearch) {
      const haystack = [
        mod.display_name,
        mod.author ?? "",
        mod.id,
        mod.workshop?.title ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(lowerSearch)) return false;
    }
    return true;
  });
}
