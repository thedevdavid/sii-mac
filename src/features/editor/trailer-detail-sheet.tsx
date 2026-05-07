import { toast } from "sonner";
import { z } from "zod";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/cupertino/sheet";
import { Button } from "@/components/cupertino/button";
import { IconTool } from "@tabler/icons-react";
import { useAppForm } from "@/lib/form";
import { useUpdateTrailer } from "@/hooks/use-mutations";
import { SliderRow, NumberRow, TextRow } from "@/features/editor/form-rows";
import type { TrailerData } from "@/features/editor/types";
import type { SavePath, TrailerId } from "@/lib/core-types";

const WEAR_MAX = 1_000_000;

function wearPercent(raw: number): number {
  return Math.round((raw / WEAR_MAX) * 100);
}

function percentToRaw(pct: number): number {
  return Math.round((pct / 100) * WEAR_MAX);
}

const TrailerEditSchema = z.object({
  body_wear: z.number().min(0).max(100),
  chassis_wear: z.number().min(0).max(100),
  cargo_mass: z.number().min(0),
  license_plate: z.string().max(32),
});

interface Props {
  trailer: TrailerData;
  savePath: SavePath;
  onClose: () => void;
  trailerIdBrand: TrailerId;
}

export function TrailerDetailSheet({
  trailer,
  savePath,
  onClose,
  trailerIdBrand,
}: Props) {
  const updateMutation = useUpdateTrailer(savePath);

  const form = useAppForm({
    defaultValues: {
      body_wear: wearPercent(trailer.body_wear),
      chassis_wear: wearPercent(trailer.chassis_wear),
      cargo_mass: trailer.cargo_mass,
      license_plate: trailer.license_plate ?? "",
    },
    validators: { onSubmit: TrailerEditSchema },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({
        trailerId: trailerIdBrand,
        changes: {
          body_wear: percentToRaw(value.body_wear),
          chassis_wear: percentToRaw(value.chassis_wear),
          cargo_mass: value.cargo_mass,
          license_plate: value.license_plate,
        },
      });
      toast.success("Trailer updated");
      onClose();
    },
  });

  return (
    <SheetContent className="sm:max-w-md">
      <SheetHeader>
        <SheetTitle>{trailer.display_name ?? trailer.id}</SheetTitle>
        <SheetDescription>
          {trailer.odometer.toLocaleString()} km{trailer.oversize && " · Oversize"}
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

        <form.Subscribe selector={(s) => s.values.body_wear}>
          {(v) => (
            <SliderRow
              label="Body Wear"
              value={v}
              onChange={(x) => form.setFieldValue("body_wear", x)}
            />
          )}
        </form.Subscribe>

        <form.Subscribe selector={(s) => s.values.chassis_wear}>
          {(v) => (
            <SliderRow
              label="Chassis Wear"
              value={v}
              onChange={(x) => form.setFieldValue("chassis_wear", x)}
            />
          )}
        </form.Subscribe>

        <form.Subscribe selector={(s) => s.values.cargo_mass}>
          {(v) => (
            <NumberRow
              id="trailer-cargo-mass"
              label="Cargo Mass (kg)"
              value={v}
              onChange={(x) => form.setFieldValue("cargo_mass", x)}
              min={0}
            />
          )}
        </form.Subscribe>

        <form.Subscribe selector={(s) => s.values.license_plate}>
          {(v) => (
            <TextRow
              id="trailer-license-plate"
              label="License Plate"
              value={v}
              onChange={(x) => form.setFieldValue("license_plate", x)}
              maxLength={32}
            />
          )}
        </form.Subscribe>

        <SheetFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <form.AppForm>
            <form.SubmitButton label="Save" />
          </form.AppForm>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}
