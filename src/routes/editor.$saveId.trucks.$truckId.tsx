import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sheet } from "@/components/cupertino/sheet";
import { useSavePath } from "@/features/editor/use-save-path";
import { useSaveData } from "@/hooks/use-save";
import { TruckDetailSheet } from "@/features/editor/truck-detail-sheet";
import { TruckIdSchema } from "@/lib/core-types";

export const Route = createFileRoute("/editor/$saveId/trucks/$truckId")({
  component: TruckDetailRoute,
});

function TruckDetailRoute() {
  const { saveId, truckId } = Route.useParams();
  const savePath = useSavePath(saveId);
  const { data } = useSaveData(savePath ?? undefined);
  const navigate = useNavigate();

  const closeToList = () =>
    navigate({
      to: "/editor/$saveId/trucks",
      params: { saveId },
      replace: true,
    });

  if (!savePath || !data) return null;

  const truck = data.trucks.find((t) => t.id === truckId);
  if (!truck) return null;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) closeToList();
      }}
    >
      <TruckDetailSheet
        truck={truck}
        savePath={savePath}
        onClose={closeToList}
        truckIdBrand={TruckIdSchema.parse(truckId)}
      />
    </Sheet>
  );
}
