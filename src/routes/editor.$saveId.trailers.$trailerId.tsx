import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sheet } from "@/components/cupertino/sheet";
import { useSavePath } from "@/features/editor/use-save-path";
import { useSaveData } from "@/hooks/use-save";
import { TrailerDetailSheet } from "@/features/editor/trailer-detail-sheet";
import { TrailerIdSchema } from "@/lib/core-types";

export const Route = createFileRoute("/editor/$saveId/trailers/$trailerId")({
  component: TrailerDetailRoute,
});

function TrailerDetailRoute() {
  const { saveId, trailerId } = Route.useParams();
  const savePath = useSavePath(saveId);
  const { data } = useSaveData(savePath ?? undefined);
  const navigate = useNavigate();

  const closeToList = () =>
    navigate({
      to: "/editor/$saveId/trailers",
      params: { saveId },
      replace: true,
    });

  if (!savePath || !data) return null;

  const trailer = data.trailers.find((t) => t.id === trailerId);
  if (!trailer) return null;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) closeToList();
      }}
    >
      <TrailerDetailSheet
        trailer={trailer}
        savePath={savePath}
        onClose={closeToList}
        trailerIdBrand={TrailerIdSchema.parse(trailerId)}
      />
    </Sheet>
  );
}
