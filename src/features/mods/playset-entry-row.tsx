import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/cupertino/button";
import { Switch } from "@/components/ui/switch";
import {
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
  IconLock,
  IconLockOpen,
  IconX,
} from "@tabler/icons-react";
import { playsetDndId } from "./dnd-ids";
import type { PlaysetEntry } from "./types";

interface PlaysetEntryRowProps {
  entry: PlaysetEntry;
  displayName?: string;
  index: number;
  total: number;
  isMissing: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleLocked: (locked: boolean) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function PlaysetEntryRow({
  entry,
  displayName,
  index,
  total,
  isMissing,
  onToggleEnabled,
  onToggleLocked,
  onRemove,
  onMoveUp,
  onMoveDown,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-locked={entry.locked || undefined}
      className={cn(
        "flex items-center gap-2 rounded-md border border-transparent bg-background p-2 text-xs",
        !entry.enabled && "opacity-50",
        isMissing && "border-destructive/40 bg-destructive/5",
        entry.locked && "border-amber-500/40 bg-amber-500/5",
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

      <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {index + 1}
      </span>

      <Switch
        checked={entry.enabled}
        onCheckedChange={onToggleEnabled}
        aria-label={`Toggle ${title}`}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium" title={title}>
          {title}
        </div>
        {isMissing && (
          <div className="text-[10px] text-destructive">Missing on disk</div>
        )}
      </div>

      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onToggleLocked(!entry.locked)}
          aria-label={entry.locked ? `Unlock ${title}` : `Lock ${title} in place`}
          title={entry.locked ? "Unlock — allow auto-fix to move" : "Lock — pin to this position"}
          className={entry.locked ? "text-amber-600" : undefined}
        >
          {entry.locked ? (
            <IconLock className="size-3.5" />
          ) : (
            <IconLockOpen className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onMoveUp}
          disabled={index === 0 || entry.locked}
          aria-label="Move up"
        >
          <IconChevronUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onMoveDown}
          disabled={index === total - 1 || entry.locked}
          aria-label="Move down"
        >
          <IconChevronDown className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label="Remove from playset"
        >
          <IconX className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
