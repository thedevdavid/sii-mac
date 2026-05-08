import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/cupertino/input";
import { Button } from "@/components/cupertino/button";
import { Checkbox } from "@/components/cupertino/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import { IconRefresh } from "@tabler/icons-react";
import type { GameBasePath, ProfilePath } from "@/lib/core-types";
import type { FullModInfo, Playset, WorkshopMetadataMap } from "./types";
import { ModLibraryRow } from "./mod-library-row";
import {
  useAddModToPlayset,
  useRemoveModFromPlayset,
} from "./use-playset-mutations";
import { useRefreshInstallationMods } from "./use-playsets";
import {
  mergeWorkshopMetadata,
  type EnrichedMod,
} from "./workshop-metadata";

interface ModLibraryProps {
  basePath: GameBasePath;
  activePlayset: Playset | undefined;
  onShowDetails: (mod: EnrichedMod) => void;
  profilePath: ProfilePath;
  installationMods: FullModInfo[] | undefined;
  workshopMap: WorkshopMetadataMap | undefined;
  isLoadingMods: boolean;
}

/** Estimated row height in px — used by the virtualizer to size the scroller. */
const ROW_HEIGHT = 64;

export function ModLibrary({
  basePath,
  activePlayset,
  onShowDetails,
  profilePath,
  installationMods,
  workshopMap,
  isLoadingMods,
}: ModLibraryProps) {
  const mods = installationMods;
  const isLoading = isLoadingMods;

  const addMutation = useAddModToPlayset(basePath, profilePath);
  const removeMutation = useRemoveModFromPlayset(basePath, profilePath);
  const refreshMutation = useRefreshInstallationMods(basePath);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [hideAdded, setHideAdded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const playsetModIds = new Set(
    activePlayset?.entries.map((e) => e.mod_id) ?? [],
  );

  const { allMods, categoryCounts, workshopCount, localCount } = aggregateMods(
    mods,
    workshopMap,
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

  const categoryOptions = [...categoryCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({
      label: value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " "),
      value,
      count,
    }));
  const sourceOptions = [
    { label: "Workshop", value: "workshop", count: workshopCount },
    { label: "Local", value: "local", count: localCount },
  ].filter((o) => o.count > 0);

  const handleToggleInPlayset = (mod: EnrichedMod) => {
    if (!activePlayset) return;
    const displayName = mod.workshop?.title ?? mod.display_name;
    if (playsetModIds.has(mod.id)) {
      removeMutation.mutate({
        playsetId: activePlayset.id,
        modId: mod.id,
        displayName,
      });
    } else {
      addMutation.mutate({
        playsetId: activePlayset.id,
        modId: mod.id,
        displayName,
      });
    }
  };

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold">
            Mod Library
            <span className="ml-1 font-normal text-muted-foreground">
              {filtered.length} of {allMods.length}
            </span>
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            title="Rescan mod folder for files added or removed outside the app"
          >
            <IconRefresh
              className={
                refreshMutation.isPending ? "size-3.5 animate-spin" : "size-3.5"
              }
            />
            Rescan
          </Button>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search mods..."
          className="h-8 text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="ml-auto flex items-center gap-1.5">
            <Checkbox
              id="hide-added"
              checked={hideAdded}
              onCheckedChange={(value) => setHideAdded(value === true)}
            />
            <Label
              htmlFor="hide-added"
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Hide added
            </Label>
          </div>
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

function aggregateMods(
  mods: FullModInfo[] | undefined,
  workshopMap: WorkshopMetadataMap | undefined,
): {
  allMods: EnrichedMod[];
  categoryCounts: Map<string, number>;
  workshopCount: number;
  localCount: number;
} {
  const allMods: EnrichedMod[] = [];
  const categoryCounts = new Map<string, number>();
  let workshopCount = 0;
  let localCount = 0;

  for (const mod of mods ?? []) {
    allMods.push(mergeWorkshopMetadata(mod, workshopMap));
    if (mod.source === "workshop") workshopCount++;
    else if (mod.source === "local") localCount++;
    for (const cat of mod.categories) {
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
  }

  return { allMods, categoryCounts, workshopCount, localCount };
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
