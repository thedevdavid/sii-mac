import { toast } from "sonner";
import { createColumnHelper } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/cupertino/button";
import { Badge } from "@/components/ui/badge";
import { IconTool, IconStar } from "@tabler/icons-react";
import { useUpdateTrailer, useRepairAllTrailers } from "@/hooks/use-mutations";
import type { TrailerData } from "@/features/editor/types";
import type { SavePath, TrailerId } from "@/lib/core-types";
import { parseLicensePlate } from "@/lib/license-plate";

const col = createColumnHelper<TrailerData>();

function buildColumns(
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
        const wear = Math.max(row.original.body_wear, row.original.chassis_wear);
        return (
          <span
            className="flex justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRepair(row.original)}
              disabled={isPending || wear === 0}
              aria-label={`Repair ${row.original.display_name ?? row.original.id}`}
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

interface TrailersTableProps {
  savePath: SavePath;
  trailers: TrailerData[];
  playerTrailerId: TrailerId | null | undefined;
  saveId: string;
}

export function TrailersTable({
  savePath,
  trailers,
  playerTrailerId,
  saveId,
}: TrailersTableProps) {
  const navigate = useNavigate();
  const updateOneMutation = useUpdateTrailer(savePath);
  const repairAllMutation = useRepairAllTrailers(savePath);

  const isPending = updateOneMutation.isPending || repairAllMutation.isPending;

  function handleRepairOne(trailer: TrailerData) {
    updateOneMutation.mutate(
      { trailerId: trailer.id, changes: { repair: true } },
      { onSuccess: () => toast.success("Trailer repaired") },
    );
  }

  const columns = buildColumns(playerTrailerId, handleRepairOne, isPending);

  return (
    <DataTable
      columns={columns}
      data={trailers}
      getRowId={(t) => t.id}
      emptyMessage="No trailers found"
      onRowClick={(trailer) =>
        navigate({
          to: "/editor/$saveId/trailers/$trailerId",
          params: { saveId, trailerId: trailer.id },
        })
      }
      toolbar={
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {trailers.length} trailers
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => repairAllMutation.mutate()}
            disabled={isPending}
          >
            <IconTool className="size-3.5" />
            Repair All
          </Button>
        </div>
      }
    />
  );
}
