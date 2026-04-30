import { Badge } from "@/components/ui/badge";
import { IconAlertTriangle } from "@tabler/icons-react";

export function DriftBadge() {
  return (
    <Badge variant="destructive" className="gap-1 text-[10px]">
      <IconAlertTriangle className="size-2.5" />
      Modified
    </Badge>
  );
}
