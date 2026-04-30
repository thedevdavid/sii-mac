import React from "react";
import { createColumnHelper, type ColumnFiltersState } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import { Button } from "@/components/cupertino/button";
import { Badge } from "@/components/ui/badge";
import { IconLockOpen } from "@tabler/icons-react";
import { useUpdateGarage, useUnlockAllGarages } from "@/hooks/use-mutations";
import { getCityInfo } from "@/lib/ats-cities";
import {
  isGarageOwned,
  type GarageData,
  type GarageStatus,
} from "@/features/editor/types";
import type { SavePath } from "@/lib/core-types";

type EnrichedGarage = GarageData & {
  display_name: string;
  state: string;
  state_abbr: string;
};

function statusLabel(status: GarageStatus): string {
  if (status === "notOwned") return "Not Owned";
  if (status === "tiny") return "Tiny";
  if (status === "small") return "Small";
  if (status === "large") return "Large";
  return `Unknown (${status.Unknown})`;
}

function statusVariant(
  status: GarageStatus,
): "default" | "secondary" | "outline" {
  if (status === "notOwned") return "outline";
  if (status === "large") return "default";
  return "secondary";
}

function isUpgradable(status: GarageStatus): boolean {
  return status === "tiny" || status === "small";
}

const col = createColumnHelper<EnrichedGarage>();

function createColumns(
  onBuy: (g: EnrichedGarage) => void,
  onUpgrade: (g: EnrichedGarage) => void,
  isPending: boolean,
) {
  return [
    col.accessor("display_name", {
      header: "City",
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    }),
    col.accessor("state_abbr", {
      id: "state",
      header: "State",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.state}</span>
      ),
      filterFn: (row, _id, filterValue: string[]) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.original.state_abbr);
      },
    }),
    col.accessor("status", {
      header: "Status",
      filterFn: (row, _id, filterValue: string[]) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(
          isGarageOwned(row.original.status) ? "owned" : "not_owned",
        );
      },
      cell: ({ getValue }) => {
        const status = getValue();
        return (
          <Badge variant={statusVariant(status)} className="text-[10px]">
            {statusLabel(status)}
          </Badge>
        );
      },
    }),
    col.accessor("vehicle_count", {
      header: "Vehicles",
      cell: ({ row }) =>
        isGarageOwned(row.original.status) ? row.original.vehicle_count : "—",
    }),
    col.accessor("driver_count", {
      header: "Drivers",
      cell: ({ row }) =>
        isGarageOwned(row.original.status) ? row.original.driver_count : "—",
    }),
    col.display({
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const g = row.original;
        return (
          <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {g.status === "notOwned" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBuy(g)}
                disabled={isPending}
              >
                Buy
              </Button>
            )}
            {isUpgradable(g.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpgrade(g)}
                disabled={isPending}
              >
                Upgrade
              </Button>
            )}
          </span>
        );
      },
      enableSorting: false,
    }),
  ];
}

interface WorldEditorProps {
  savePath: SavePath;
  garages: GarageData[];
}

export function WorldEditor({ savePath, garages }: WorldEditorProps) {
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = React.useState<Set<string>>(new Set());
  const garageMutation = useUpdateGarage(savePath);
  const unlockMutation = useUnlockAllGarages(savePath);

  const isPending = garageMutation.isPending || unlockMutation.isPending;

  const enrichedGarages: EnrichedGarage[] = garages.map((g) => {
    const info = getCityInfo(g.city_name);
    return { ...g, display_name: info.name, state: info.state, state_abbr: info.abbr };
  });

  const ownedCount = garages.filter((g) => isGarageOwned(g.status)).length;

  // Faceted filter options
  const stateOptions = (() => {
    const map = new Map<string, number>();
    for (const g of enrichedGarages) map.set(g.state_abbr, (map.get(g.state_abbr) ?? 0) + 1);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([abbr, count]) => ({
      label: abbr, value: abbr, count,
    }));
  })();

  const statusOptions = [
    { label: "Owned", value: "owned", count: ownedCount },
    { label: "Not Owned", value: "not_owned", count: garages.length - ownedCount },
  ];

  // Build column filters
  const columnFilters: ColumnFiltersState = [
    ...(stateFilter.size > 0 ? [{ id: "state", value: [...stateFilter] }] : []),
    ...(statusFilter.size > 0 ? [{ id: "status", value: [...statusFilter] }] : []),
  ];

  function handleBuy(g: EnrichedGarage) {
    garageMutation.mutate({ garageId: g.id, change: { status: "tiny" } });
  }

  function handleUpgrade(g: EnrichedGarage) {
    garageMutation.mutate({ garageId: g.id, change: { status: "large" } });
  }

  const columns = createColumns(handleBuy, handleUpgrade, isPending);

  return (
    <DataTable
      columns={columns}
      data={enrichedGarages}
      globalFilter={globalFilter}
      columnFilters={columnFilters}
      emptyMessage="No garages found"
      initialSorting={[{ id: "status", desc: true }]}
      enablePagination
      pageSize={50}
      toolbar={
        <DataTableToolbar
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          searchPlaceholder="Search cities..."
          actions={
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {ownedCount}/{garages.length} owned
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => unlockMutation.mutate()}
                disabled={isPending || ownedCount === garages.length}
              >
                <IconLockOpen className="size-3.5" />
                Unlock All
              </Button>
            </div>
          }
        >
          <DataTableFacetedFilter
            title="State"
            options={stateOptions}
            selected={stateFilter}
            onSelectionChange={setStateFilter}
          />
          <DataTableFacetedFilter
            title="Status"
            options={statusOptions}
            selected={statusFilter}
            onSelectionChange={setStatusFilter}
          />
        </DataTableToolbar>
      }
    />
  );
}
