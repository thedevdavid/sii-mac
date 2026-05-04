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
import { IconTool, IconStar, IconLoader2 } from "@tabler/icons-react";
import { updateTrailer, repairAllTrailers } from "@/lib/tauri-commands";
import { queryKeys } from "@/lib/query-keys";
import type { TrailerData } from "@/features/editor/types";
import type { SavePath, TrailerId } from "@/lib/core-types";

const col = createColumnHelper<TrailerData>();

function createColumns(
  playerTrailerId: TrailerId | null | undefined,
  onRepair: (t: TrailerData) => void,
  isPending: boolean,
) {
  return [
    col.accessor("display_name", {
      header: "Trailer",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">
            {row.original.display_name ?? row.original.id}
          </span>
          {row.original.id === playerTrailerId && (
            <Badge variant="default" className="shrink-0 text-[10px]">
              <IconStar className="mr-0.5 size-2.5" />
              Active
            </Badge>
          )}
        </span>
      ),
    }),
    col.accessor("cargo_mass", {
      header: "Cargo",
      cell: ({ row }) =>
        row.original.cargo_mass > 0
          ? `${Math.round(row.original.cargo_mass).toLocaleString()} kg`
          : "Empty",
    }),
    col.accessor("odometer", {
      header: "Odometer",
      cell: ({ getValue }) => `${getValue().toLocaleString()} km`,
    }),
    col.display({
      id: "condition",
      header: "Condition",
      cell: ({ row }) => {
        const wear = Math.max(row.original.body_wear, row.original.chassis_wear);
        return (
          <Badge
            variant={wear === 0 ? "secondary" : "destructive"}
            className="text-[10px]"
          >
            {wear === 0 ? "Perfect" : "Damaged"}
          </Badge>
        );
      },
      enableSorting: true,
      sortingFn: (a, b) =>
        Math.max(a.original.body_wear, a.original.chassis_wear) -
        Math.max(b.original.body_wear, b.original.chassis_wear),
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
        const wear = Math.max(row.original.body_wear, row.original.chassis_wear);
        return (
          <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRepair(row.original)}
              disabled={isPending || wear === 0}
            >
              <IconTool className="size-3" />
            </Button>
          </span>
        );
      },
      enableSorting: false,
    }),
  ];
}

// --- Detail sheet ---

const TrailerEditSchema = z.object({
  body_wear: z.number().min(0).max(100),
  chassis_wear: z.number().min(0).max(100),
  cargo_mass: z.number().min(0),
  license_plate: z.string(),
});

function TrailerDetailSheet({
  trailer,
  savePath,
  onClose,
  onSaved,
}: {
  trailer: TrailerData;
  savePath: SavePath;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    defaultValues: {
      body_wear: trailer.body_wear,
      chassis_wear: trailer.chassis_wear,
      cargo_mass: trailer.cargo_mass,
      license_plate: trailer.license_plate ?? "",
    },
    validators: { onChange: TrailerEditSchema },
    onSubmit: ({ value }) => {
      startTransition(async () => {
        try {
          await updateTrailer(savePath, trailer.id, {
            body_wear: value.body_wear,
            chassis_wear: value.chassis_wear,
            cargo_mass: value.cargo_mass,
            license_plate: value.license_plate,
          });
          toast.success("Trailer updated");
          onSaved();
          onClose();
        } catch (err) {
          toast.error(`Failed: ${(err as Error).message ?? err}`);
        }
      });
    },
  });

  return (
    <SheetContent className="sm:max-w-md">
      <SheetHeader>
        <SheetTitle>{trailer.display_name ?? trailer.id}</SheetTitle>
        <SheetDescription>
          {trailer.odometer.toLocaleString()} km
          {trailer.oversize && " · Oversize"}
        </SheetDescription>
      </SheetHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-5 p-4"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            form.setFieldValue("body_wear", 0);
            form.setFieldValue("chassis_wear", 0);
          }}
        >
          <IconTool className="size-3.5" />
          Repair All
        </Button>

        {(
          [
            ["body_wear", "Body Wear"],
            ["chassis_wear", "Chassis Wear"],
          ] as const
        ).map(([name, label]) => (
          <form.Field
            key={name}
            name={name}
            children={(field) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <span className="text-xs text-muted-foreground">
                    {field.state.value}
                  </span>
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

        <form.Field
          name="cargo_mass"
          children={(field) => (
            <div className="space-y-2">
              <Label>Cargo Mass (kg)</Label>
              <Input
                type="number"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
                min={0}
              />
            </div>
          )}
        />

        <form.Field
          name="license_plate"
          children={(field) => (
            <div className="space-y-2">
              <Label>License Plate</Label>
              <Input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
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

// --- Main ---

interface TrailersTableProps {
  savePath: SavePath;
  trailers: TrailerData[];
  playerTrailerId: TrailerId | null | undefined;
}

export function TrailersTable({
  savePath,
  trailers,
  playerTrailerId,
}: TrailersTableProps) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [selectedTrailer, setSelectedTrailer] = useState<TrailerData | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.saves.data(savePath) });
  }

  function handleRepairAll() {
    startTransition(async () => {
      try {
        const count = await repairAllTrailers(savePath);
        toast.success(`Repaired ${count} trailers`);
        invalidate();
      } catch (err) {
        toast.error(`Failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  function handleRepairOne(trailer: TrailerData) {
    startTransition(async () => {
      try {
        await updateTrailer(savePath, trailer.id, { repair: true });
        toast.success("Trailer repaired");
        invalidate();
      } catch (err) {
        toast.error(`Failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  const columns = createColumns(playerTrailerId, handleRepairOne, isPending);

  return (
    <>
      <DataTable
        columns={columns}
        data={trailers}
        emptyMessage="No trailers found"
        onRowClick={(trailer) => setSelectedTrailer(trailer)}
        toolbar={
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {trailers.length} trailers
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRepairAll}
              disabled={isPending}
            >
              <IconTool className="size-3.5" />
              Repair All
            </Button>
          </div>
        }
      />

      {selectedTrailer && (
        <Sheet open onOpenChange={(open) => { if (!open) setSelectedTrailer(null); }}>
          <TrailerDetailSheet
            trailer={selectedTrailer}
            savePath={savePath}
            onClose={() => setSelectedTrailer(null)}
            onSaved={invalidate}
          />
        </Sheet>
      )}
    </>
  );
}
