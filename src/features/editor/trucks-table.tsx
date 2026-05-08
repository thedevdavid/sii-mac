import { toast } from "sonner";
import { createColumnHelper } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/cupertino/button";
import { Badge } from "@/components/ui/badge";
import { ButtonGroup } from "@/components/ui/button-group";
import { Progress } from "@/components/ui/progress";
import { IconTool, IconGasStation, IconStar } from "@tabler/icons-react";
import { useUpdateTruck, useUpdateAllTrucks } from "@/hooks/use-mutations";
import type { TruckData } from "@/features/editor/types";
import type { SavePath, TruckId } from "@/lib/core-types";
import { parseLicensePlate } from "@/lib/license-plate";

// SCS stores wear values as integers in 0..=WEAR_MAX. The UI rounds to a
// 0..100 percent for badge thresholds so we don't dilute the column with
// six-digit raw counts.
const WEAR_MAX = 1_000_000;

function wearPercent(raw: number): number {
  return Math.round((raw / WEAR_MAX) * 100);
}

function maxWear(truck: TruckData): number {
  // Include wheels/tires — the in-game service screen also gates on these,
  // so a "Damaged" truck whose only fault is a worn tire would otherwise read
  // "Perfect" here while the game still recommends a service stop.
  const wheelsMax = truck.wheels_wear.length > 0 ? Math.max(...truck.wheels_wear) : 0;
  return Math.max(
    truck.engine_wear,
    truck.transmission_wear,
    truck.cabin_wear,
    truck.chassis_wear,
    wheelsMax,
  );
}

function wearLabel(wear: number): string {
  const pct = wearPercent(wear);
  if (pct === 0) return "Perfect";
  if (pct < 10) return "Good";
  if (pct < 30) return "Worn";
  return "Damaged";
}

function wearVariant(
  wear: number,
): "default" | "secondary" | "destructive" | "outline" {
  const pct = wearPercent(wear);
  if (pct === 0) return "secondary";
  if (pct < 30) return "outline";
  return "destructive";
}

const col = createColumnHelper<TruckData>();

function buildColumns(
  playerTruckId: TruckId | null | undefined,
  onRepair: (truck: TruckData) => void,
  onRefuel: (truck: TruckData) => void,
  isPending: boolean,
) {
  return [
    col.accessor("display_name", {
      header: "Truck",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">
            {row.original.display_name ?? row.original.id}
          </span>
          {row.original.id === playerTruckId && (
            <Badge variant="default" className="shrink-0 text-[10px]">
              <IconStar className="mr-0.5 size-2.5" />
              Active
            </Badge>
          )}
        </span>
      ),
    }),
    col.accessor("odometer", {
      header: "Odometer",
      cell: ({ getValue }) => `${getValue().toLocaleString()} km`,
    }),
    col.accessor("fuel_relative", {
      header: "Fuel",
      cell: ({ getValue }) => {
        const pct = Math.round(getValue() * 100);
        return (
          <span className="flex w-24 items-center gap-1.5">
            <Progress value={pct} className="h-1.5 flex-1" />
            <span className="w-8 text-right text-[10px] text-muted-foreground">
              {pct}%
            </span>
          </span>
        );
      },
    }),
    col.display({
      id: "condition",
      header: "Condition",
      cell: ({ row }) => {
        const wear = maxWear(row.original);
        return (
          <Badge variant={wearVariant(wear)} className="text-[10px]">
            {wearLabel(wear)}
          </Badge>
        );
      },
      sortingFn: (a, b) => maxWear(a.original) - maxWear(b.original),
      enableSorting: true,
    }),
    col.accessor("license_plate", {
      header: "Plate",
      cell: ({ getValue }) => {
        const parsed = parseLicensePlate(getValue());
        if (!parsed?.text) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-mono text-foreground">{parsed.text}</span>
            {parsed.state && (
              <span className="text-[10px] uppercase tracking-wide">
                {parsed.state}
              </span>
            )}
          </span>
        );
      },
    }),
    col.display({
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const truck = row.original;
        const wear = maxWear(truck);
        const fuelPct = Math.round(truck.fuel_relative * 100);
        return (
          <span
            className="flex justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRepair(truck)}
              disabled={isPending || wear === 0}
              aria-label={`Repair ${truck.display_name ?? truck.id}`}
            >
              <IconTool className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRefuel(truck)}
              disabled={isPending || fuelPct >= 100}
              aria-label={`Refuel ${truck.display_name ?? truck.id}`}
            >
              <IconGasStation className="size-3" />
            </Button>
          </span>
        );
      },
      enableSorting: false,
    }),
  ];
}

interface TrucksTableProps {
  savePath: SavePath;
  trucks: TruckData[];
  playerTruckId: TruckId | null | undefined;
  saveId: string;
}

export function TrucksTable({
  savePath,
  trucks,
  playerTruckId,
  saveId,
}: TrucksTableProps) {
  const navigate = useNavigate();
  const updateOneMutation = useUpdateTruck(savePath);
  const bulkMutation = useUpdateAllTrucks(savePath);

  const isPending = updateOneMutation.isPending || bulkMutation.isPending;

  function handleRepairOne(truck: TruckData) {
    updateOneMutation.mutate(
      { truckId: truck.id, changes: { repair: true } },
      { onSuccess: () => toast.success("Truck repaired") },
    );
  }

  function handleRefuelOne(truck: TruckData) {
    updateOneMutation.mutate(
      { truckId: truck.id, changes: { refuel: true } },
      { onSuccess: () => toast.success("Truck refueled") },
    );
  }

  const columns = buildColumns(
    playerTruckId,
    handleRepairOne,
    handleRefuelOne,
    isPending,
  );

  return (
    <DataTable
      columns={columns}
      data={trucks}
      getRowId={(t) => t.id}
      emptyMessage="No trucks found"
      onRowClick={(truck) =>
        navigate({
          to: "/editor/$saveId/trucks/$truckId",
          params: { saveId, truckId: truck.id },
        })
      }
      toolbar={
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {trucks.length} trucks
          </span>
          <ButtonGroup>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkMutation.mutate("RepairAll")}
              disabled={isPending}
            >
              <IconTool className="size-3.5" />
              Repair All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkMutation.mutate("RefuelAll")}
              disabled={isPending}
            >
              <IconGasStation className="size-3.5" />
              Refuel All
            </Button>
          </ButtonGroup>
        </div>
      }
    />
  );
}
