import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/cupertino/button";
import { Checkbox } from "@/components/cupertino/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  IconChevronDown,
  IconChevronsDown,
  IconChevronsUp,
  IconChevronUp,
  IconDots,
  IconGripVertical,
  IconLock,
  IconLockOpen,
  IconTrash,
} from "@tabler/icons-react";
import { playsetDndId } from "./dnd-ids";
import type { PlaysetEntry } from "./types";

/**
 * Stable HSL color derived from a group id. Same id → same hue every render
 * so users can visually associate rows in a group at a glance.
 */
function groupColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = (hash * 31 + groupId.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

interface PlaysetEntryRowProps {
  entry: PlaysetEntry;
  displayName?: string;
  index: number;
  total: number;
  isMissing: boolean;
  isSelected: boolean;
  hasSelection: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleLocked: (locked: boolean) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
  onToggleSelected: () => void;
}

export function PlaysetEntryRow({
  entry,
  displayName,
  index,
  total,
  isMissing,
  isSelected,
  hasSelection,
  onToggleEnabled,
  onToggleLocked,
  onRemove,
  onMoveUp,
  onMoveDown,
  onMoveToTop,
  onMoveToBottom,
  onToggleSelected,
}: PlaysetEntryRowProps) {
  const title = displayName ?? entry.display_name;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: playsetDndId(entry.mod_id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-locked={entry.locked || undefined}
      data-selected={isSelected || undefined}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-transparent bg-background p-2 text-xs",
        !entry.enabled && "opacity-50",
        isMissing && "border-destructive/40 bg-destructive/5",
        entry.locked && "border-amber-500/40 bg-amber-500/5",
        isSelected && "border-primary/40 bg-primary/5",
        isDragging && "z-10 border-primary shadow-md",
      )}
    >
      <button
        type="button"
        className={cn(
          "touch-none text-muted-foreground",
          entry.locked
            ? "cursor-not-allowed opacity-40"
            : "cursor-grab active:cursor-grabbing",
        )}
        aria-label={
          entry.locked
            ? `${title} is locked — unlock to drag`
            : `Drag to reorder ${title}`
        }
        {...(entry.locked ? {} : attributes)}
        {...(entry.locked ? {} : listeners)}
      >
        <IconGripVertical className="size-3.5" />
      </button>

      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggleSelected}
        aria-label={`Select ${title}`}
        className={cn(
          "transition-opacity",
          hasSelection || isSelected
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      />

      <Switch
        checked={entry.enabled}
        onCheckedChange={onToggleEnabled}
        aria-label={`Toggle ${title}`}
      />

      {entry.lock_group != null && (
        <span
          className="size-2 shrink-0 rounded-full ring-1 ring-foreground/20"
          style={{ backgroundColor: groupColor(entry.lock_group) }}
          title={`Group ${entry.lock_group.slice(0, 6)} — stays adjacent during auto-fix`}
          aria-label="Locked group member"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {entry.locked && (
            <IconLock className="size-3 shrink-0 text-amber-600" />
          )}
          <span className="truncate font-medium" title={title}>
            {title}
          </span>
        </div>
        {isMissing && (
          <div className="text-[10px] text-destructive">Missing on disk</div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${title}`}
            />
          }
        >
          <IconDots className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem] text-xs">
          <DropdownMenuItem
            onClick={onMoveToTop}
            disabled={isFirst || entry.locked}
            className="whitespace-nowrap"
          >
            <IconChevronsUp className="size-3.5" />
            Move to top
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onMoveUp}
            disabled={isFirst || entry.locked}
            className="whitespace-nowrap"
          >
            <IconChevronUp className="size-3.5" />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onMoveDown}
            disabled={isLast || entry.locked}
            className="whitespace-nowrap"
          >
            <IconChevronDown className="size-3.5" />
            Move down
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onMoveToBottom}
            disabled={isLast || entry.locked}
            className="whitespace-nowrap"
          >
            <IconChevronsDown className="size-3.5" />
            Move to bottom
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onToggleLocked(!entry.locked)}
            className="whitespace-nowrap"
          >
            {entry.locked ? (
              <>
                <IconLockOpen className="size-3.5" />
                Unlock position
              </>
            ) : (
              <>
                <IconLock className="size-3.5" />
                Lock position
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={onRemove}
            className="whitespace-nowrap"
          >
            <IconTrash className="size-3.5" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
