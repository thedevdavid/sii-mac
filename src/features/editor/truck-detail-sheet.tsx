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
import { IconTool, IconGasStation } from "@tabler/icons-react";
import { useAppForm } from "@/lib/form";
import { useUpdateTruck } from "@/hooks/use-mutations";
import { SliderRow, TextRow } from "@/features/editor/form-rows";
import type { TruckData } from "@/features/editor/types";
import type { SavePath, TruckId } from "@/lib/core-types";

// SCS stores wear values as integers in 0..=WEAR_MAX. The form layer works in
// 0..100 percent so sliders are intuitive; we convert at the boundaries.
const WEAR_MAX = 1_000_000;

function wearPercent(raw: number): number {
  return Math.round((raw / WEAR_MAX) * 100);
}

function percentToRaw(pct: number): number {
  return Math.round((pct / 100) * WEAR_MAX);
}

const TruckEditSchema = z.object({
  fuel: z.number().min(0).max(100),
  engine_wear: z.number().min(0).max(100),
  transmission_wear: z.number().min(0).max(100),
  cabin_wear: z.number().min(0).max(100),
  chassis_wear: z.number().min(0).max(100),
  wheels_wear: z.number().min(0).max(100),
  license_plate: z.string().max(32),
});

function maxWheelWear(values: number[]): number {
  return values.length > 0 ? Math.max(...values) : 0;
}

interface Props {
  truck: TruckData;
  savePath: SavePath;
  onClose: () => void;
  truckIdBrand: TruckId;
}

/**
 * Slider values are bound through `<form.Subscribe>` rather than `useField`.
 * Subscribe re-renders only its own children when the selected value changes,
 * so dragging a slider does not re-render the sheet, the form wrapper, or the
 * table behind it. This is also the documented pattern for fine-grained UI
 * reactivity in TanStack Form (`docs/framework/react/guides/reactivity`).
 */
export function TruckDetailSheet({ truck, savePath, onClose, truckIdBrand }: Props) {
  const updateMutation = useUpdateTruck(savePath);

  const form = useAppForm({
    defaultValues: {
      fuel: Math.round(truck.fuel_relative * 100),
      engine_wear: wearPercent(truck.engine_wear),
      transmission_wear: wearPercent(truck.transmission_wear),
      cabin_wear: wearPercent(truck.cabin_wear),
      chassis_wear: wearPercent(truck.chassis_wear),
      wheels_wear: wearPercent(maxWheelWear(truck.wheels_wear)),
      license_plate: truck.license_plate ?? "",
    },
    validators: { onSubmit: TruckEditSchema },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({
        truckId: truckIdBrand,
        changes: {
          fuel_relative: value.fuel / 100,
          engine_wear: percentToRaw(value.engine_wear),
          transmission_wear: percentToRaw(value.transmission_wear),
          cabin_wear: percentToRaw(value.cabin_wear),
          chassis_wear: percentToRaw(value.chassis_wear),
          wheels_wear: percentToRaw(value.wheels_wear),
          license_plate: value.license_plate,
        },
      });
      toast.success("Truck updated");
      onClose();
    },
  });

  return (
    <SheetContent className="sm:max-w-md">
      <SheetHeader>
        <SheetTitle>{truck.display_name ?? truck.id}</SheetTitle>
        <SheetDescription>
          {truck.odometer.toLocaleString()} km &middot; {truck.accessory_count}{" "}
          accessories
        </SheetDescription>
      </SheetHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-5 p-4"
      >
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              form.setFieldValue("engine_wear", 0);
              form.setFieldValue("transmission_wear", 0);
              form.setFieldValue("cabin_wear", 0);
              form.setFieldValue("chassis_wear", 0);
              form.setFieldValue("wheels_wear", 0);
            }}
          >
            <IconTool className="size-3.5" />
            Repair All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => form.setFieldValue("fuel", 100)}
          >
            <IconGasStation className="size-3.5" />
            Fill Tank
          </Button>
        </div>

        <form.Subscribe selector={(s) => s.values.fuel}>
          {(fuel) => (
            <SliderRow
              label="Fuel"
              value={fuel}
              onChange={(v) => form.setFieldValue("fuel", v)}
              formatValue={(v) => `${v}%`}
            />
          )}
        </form.Subscribe>

        <form.Subscribe selector={(s) => s.values.engine_wear}>
          {(v) => (
            <SliderRow
              label="Engine Wear"
              value={v}
              onChange={(x) => form.setFieldValue("engine_wear", x)}
            />
          )}
        </form.Subscribe>

        <form.Subscribe selector={(s) => s.values.transmission_wear}>
          {(v) => (
            <SliderRow
              label="Transmission Wear"
              value={v}
              onChange={(x) => form.setFieldValue("transmission_wear", x)}
            />
          )}
        </form.Subscribe>

        <form.Subscribe selector={(s) => s.values.cabin_wear}>
          {(v) => (
            <SliderRow
              label="Cabin Wear"
              value={v}
              onChange={(x) => form.setFieldValue("cabin_wear", x)}
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

        <form.Subscribe selector={(s) => s.values.wheels_wear}>
          {(v) => (
            <SliderRow
              label="Wheels & Tires"
              value={v}
              onChange={(x) => form.setFieldValue("wheels_wear", x)}
            />
          )}
        </form.Subscribe>

        <form.Subscribe selector={(s) => s.values.license_plate}>
          {(v) => (
            <TextRow
              id="truck-license-plate"
              label="License Plate"
              value={v}
              onChange={(x) => form.setFieldValue("license_plate", x)}
              placeholder="e.g. ABC123|california"
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
