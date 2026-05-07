import { Link, useParams } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { useSavePath } from "@/features/editor/use-save-path";
import { useSaveData } from "@/hooks/use-save";
import { isGarageOwned } from "@/features/editor/types";

const BASE =
  "relative inline-flex h-full items-center gap-1.5 rounded-md px-3 text-xs font-medium text-foreground/60 transition-all hover:text-foreground";
const ACTIVE = "bg-background text-foreground shadow-sm";

/**
 * macOS-style segmented tab bar driven by the URL. Active state is derived
 * from the matched route — there's no local UI state to sync.
 */
export function EditorTabsNav() {
  const { saveId } = useParams({ from: "/editor/$saveId" });
  const savePath = useSavePath(saveId);
  const { data } = useSaveData(savePath ?? undefined);

  const trucksCount = data?.trucks.length ?? 0;
  const trailersCount = data?.trailers.length ?? 0;
  const ownedGarages = data?.garages.filter((g) => isGarageOwned(g.status)).length ?? 0;
  const totalGarages = data?.garages.length ?? 0;

  return (
    <nav
      className="inline-flex h-8 items-center rounded-lg bg-muted p-1 text-muted-foreground"
      aria-label="Save sections"
    >
      <Link
        to="/editor/$saveId/player"
        params={{ saveId }}
        className={BASE}
        activeProps={{ className: ACTIVE }}
      >
        Player
      </Link>
      <Link
        to="/editor/$saveId/trucks"
        params={{ saveId }}
        className={BASE}
        activeProps={{ className: ACTIVE }}
      >
        Trucks
        {data && (
          <Badge variant="secondary" className="ml-0.5">
            {trucksCount}
          </Badge>
        )}
      </Link>
      <Link
        to="/editor/$saveId/trailers"
        params={{ saveId }}
        className={BASE}
        activeProps={{ className: ACTIVE }}
      >
        Trailers
        {data && (
          <Badge variant="secondary" className="ml-0.5">
            {trailersCount}
          </Badge>
        )}
      </Link>
      <Link
        to="/editor/$saveId/world"
        params={{ saveId }}
        className={BASE}
        activeProps={{ className: ACTIVE }}
      >
        World
        {data && (
          <Badge variant="secondary" className="ml-0.5">
            {ownedGarages}/{totalGarages}
          </Badge>
        )}
      </Link>
    </nav>
  );
}
