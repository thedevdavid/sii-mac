import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/cupertino/button";
import { Input } from "@/components/cupertino/input";
import { Badge } from "@/components/ui/badge";
import { ButtonGroup } from "@/components/ui/button-group";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/cupertino/sheet";
import {
  IconTool,
  IconGasStation,
  IconStar,
  IconLoader2,
} from "@tabler/icons-react";
import { updateTruck, updateAllTrucks } from "@/lib/tauri-commands";
import { queryKeys } from "@/lib/query-keys";
import type { TruckData } from "@/features/editor/types";
import type { SavePath, TruckId } from "@/lib/core-types";

// --- Helpers ---

function maxWear(truck: TruckData): number {
  return Math.max(
    truck.engine_wear,
    truck.transmission_wear,
    truck.cabin_wear,
    truck.chassis_wear,
  );
}

function wearLabel(wear: number): string {
  if (wear === 0) return "Perfect";
  if (wear < 10) return "Good";
  if (wear < 30) return "Worn";
  return "Damaged";
}

function wearVariant(
  wear: number,
): "default" | "secondary" | "destructive" | "outline" {
  if (wear === 0) return "secondary";
  if (wear < 30) return "outline";
  return "destructive";
}

// --- Column definitions ---

const col = createColumnHelper<TruckData>();

function createColumns(
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
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue() || "—"}</span>
      ),
    }),
    col.display({
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const truck = row.original;
        const wear = maxWear(truck);
        const fuelPct = Math.round(truck.fuel_relative * 100);
        return (
          <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRepair(truck)}
              disabled={isPending || wear === 0}
            >
              <IconTool className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRefuel(truck)}
              disabled={isPending || fuelPct >= 100}
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

// --- Detail sheet form ---

const TruckEditSchema = z.object({
  fuel: z.number().min(0).max(100),
  engine_wear: z.number().min(0).max(100),
  transmission_wear: z.number().min(0).max(100),
  cabin_wear: z.number().min(0).max(100),
  chassis_wear: z.number().min(0).max(100),
  license_plate: z.string(),
});

function TruckDetailSheet({
  truck,
  savePath,
  onClose,
  onSaved,
}: {
  truck: TruckData;
  savePath: SavePath;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    defaultValues: {
      fuel: Math.round(truck.fuel_relative * 100),
      engine_wear: truck.engine_wear,
      transmission_wear: truck.transmission_wear,
      cabin_wear: truck.cabin_wear,
      chassis_wear: truck.chassis_wear,
      license_plate: truck.license_plate ?? "",
    },
    validators: { onChange: TruckEditSchema },
    onSubmit: ({ value }) => {
      startTransition(async () => {
        try {
          await updateTruck(savePath, truck.id, {
            fuel_relative: value.fuel / 100,
            engine_wear: value.engine_wear,
            transmission_wear: value.transmission_wear,
            cabin_wear: value.cabin_wear,
            chassis_wear: value.chassis_wear,
            license_plate: value.license_plate,
          });
          toast.success("Truck updated");
          onSaved();
          onClose();
        } catch (err) {
          toast.error(`Failed: ${(err as Error).message ?? err}`);
        }
      });
    },
  });

  function handleRepairAll() {
    form.setFieldValue("engine_wear", 0);
    form.setFieldValue("transmission_wear", 0);
    form.setFieldValue("cabin_wear", 0);
    form.setFieldValue("chassis_wear", 0);
  }

  function handleFillTank() {
    form.setFieldValue("fuel", 100);
  }

  return (
    <SheetContent className="sm:max-w-md">
      <SheetHeader>
        <SheetTitle>{truck.display_name ?? truck.id}</SheetTitle>
        <SheetDescription>
          {truck.odometer.toLocaleString()} km &middot;{" "}
          {truck.accessory_count} accessories
        </SheetDescription>
      </SheetHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-5 p-4"
      >
        {/* Quick actions */}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleRepairAll}>
            <IconTool className="size-3.5" />
            Repair All
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleFillTank}>
            <IconGasStation className="size-3.5" />
            Fill Tank
          </Button>
        </div>

        {/* Fuel slider */}
        <form.Field
          name="fuel"
          children={(field) => (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fuel</Label>
                <span className="text-xs text-muted-foreground">{field.state.value}%</span>
              </div>
              <Slider
                value={[field.state.value]}
                onValueChange={(v) =>
                  field.handleChange(Array.isArray(v) ? v[0] : v)
                }
                max={100}
                step={1}
              />
            </div>
          )}
        />

        {/* Wear sliders */}
        {(
          [
            ["engine_wear", "Engine"],
            ["transmission_wear", "Transmission"],
            ["cabin_wear", "Cabin"],
            ["chassis_wear", "Chassis"],
          ] as const
        ).map(([name, label]) => (
          <form.Field
            key={name}
            name={name}
            children={(field) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{label} Wear</Label>
                  <span className="text-xs text-muted-foreground">{field.state.value}</span>
                </div>
                <Slider
                  value={[field.state.value]}
                  onValueChange={(v) =>
                    field.handleChange(Array.isArray(v) ? v[0] : v)
                  }
                  max={100}
                  step={1}
                />
              </div>
            )}
          />
        ))}

        {/* License plate */}
        <form.Field
          name="license_plate"
          children={(field) => (
            <div className="space-y-2">
              <Label>License Plate</Label>
              <Input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="e.g. ABC123|california"
              />
            </div>
          )}
        />

        <SheetFooter>
          <SheetClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </SheetClose>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending && <IconLoader2 className="mr-1.5 size-3 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}

// --- Main component ---

interface TrucksTableProps {
  savePath: SavePath;
  trucks: TruckData[];
  playerTruckId: TruckId | null | undefined;
}

export function TrucksTable({
  savePath,
  trucks,
  playerTruckId,
}: TrucksTableProps) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [selectedTruck, setSelectedTruck] = useState<TruckData | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
  }

  function handleRepairAll() {
    startTransition(async () => {
      try {
        const count = await updateAllTrucks(savePath, "RepairAll");
        toast.success(`Repaired ${count} trucks`);
        invalidate();
      } catch (err) {
        toast.error(`Repair failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  function handleRefuelAll() {
    startTransition(async () => {
      try {
        const count = await updateAllTrucks(savePath, "RefuelAll");
        toast.success(`Refueled ${count} trucks`);
        invalidate();
      } catch (err) {
        toast.error(`Refuel failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  function handleRepairOne(truck: TruckData) {
    startTransition(async () => {
      try {
        await updateTruck(savePath, truck.id, { repair: true });
        toast.success("Truck repaired");
        invalidate();
      } catch (err) {
        toast.error(`Failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  function handleRefuelOne(truck: TruckData) {
    startTransition(async () => {
      try {
        await updateTruck(savePath, truck.id, { refuel: true });
        toast.success("Truck refueled");
        invalidate();
      } catch (err) {
        toast.error(`Failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  const columns = createColumns(playerTruckId, handleRepairOne, handleRefuelOne, isPending);

  return (
    <>
      <DataTable
        columns={columns}
        data={trucks}
        emptyMessage="No trucks found"
        onRowClick={(truck) => setSelectedTruck(truck)}
        toolbar={
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {trucks.length} trucks
            </span>
            <ButtonGroup>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRepairAll}
                disabled={isPending}
              >
                <IconTool className="size-3.5" />
                Repair All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefuelAll}
                disabled={isPending}
              >
                <IconGasStation className="size-3.5" />
                Refuel All
              </Button>
            </ButtonGroup>
          </div>
        }
      />

      {selectedTruck && (
        <Sheet open onOpenChange={(open) => { if (!open) setSelectedTruck(null); }}>
          <TruckDetailSheet
            truck={selectedTruck}
            savePath={savePath}
            onClose={() => setSelectedTruck(null)}
            onSaved={invalidate}
          />
        </Sheet>
      )}
    </>
  );
}
