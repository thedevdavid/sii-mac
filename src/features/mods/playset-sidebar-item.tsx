import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  IconCopy,
  IconDownload,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
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
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
              isActive
                ? "bg-primary/10 text-foreground"
                : "hover:bg-accent text-muted-foreground hover:text-foreground",
            )}
          />
        }
      >
        {/* Body region — clicking here activates the playset. */}
        <div
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
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
              playset.color ??
                (isActive ? "bg-primary" : "bg-muted-foreground/40"),
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
        </div>
        {/* Menu button — outside the activate region, with its own propagation
            stop so opening the menu doesn't switch the active playset. */}
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <PlaysetActionsMenu
            playset={playset}
            isActive={isActive}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onExport={onExport}
            onDelete={onDelete}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="text-xs">
        <ContextMenuItem onClick={onRename}>
          <IconPencil className="size-3.5" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>
          <IconCopy className="size-3.5" />
          Duplicate
        </ContextMenuItem>
        <ContextMenuItem onClick={onExport}>
          <IconDownload className="size-3.5" />
          Export JSON
        </ContextMenuItem>
        {!isActive && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <IconTrash className="size-3.5" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
