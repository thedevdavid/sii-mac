import { cn } from "@/lib/utils";
import { DriftBadge } from "./drift-badge";
import { PlaysetActionsMenu } from "./playset-actions-menu";
import type { Playset } from "./types";

interface PlaysetSidebarItemProps {
  playset: Playset;
  isActive: boolean;
  hasDrift: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export function PlaysetSidebarItem({
  playset,
  isActive,
  hasDrift,
  onSelect,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: PlaysetSidebarItemProps) {
  const enabledCount = playset.entries.filter((e) => e.enabled).length;

  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
        isActive
          ? "bg-primary/10 text-foreground"
          : "hover:bg-accent text-muted-foreground hover:text-foreground",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div
        className={cn(
          "size-2 shrink-0 rounded-full",
          playset.color ?? (isActive ? "bg-primary" : "bg-muted-foreground/40"),
        )}
        style={playset.color ? { backgroundColor: playset.color } : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{playset.name}</span>
          {playset.is_temporary && (
            <span className="text-[10px] italic text-muted-foreground">
              (Temporary)
            </span>
          )}
          {hasDrift && isActive && <DriftBadge />}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {enabledCount} / {playset.entries.length} enabled
        </div>
      </div>
      <PlaysetActionsMenu
        playset={playset}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onExport={onExport}
        onDelete={onDelete}
      />
    </div>
  );
}
