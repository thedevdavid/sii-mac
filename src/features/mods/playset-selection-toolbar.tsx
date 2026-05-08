import { Button } from "@/components/cupertino/button";
import {
  IconChevronsDown,
  IconChevronsUp,
  IconLink,
  IconLinkOff,
  IconLock,
  IconLockOpen,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

interface PlaysetSelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  /** True if every selected entry already shares the same `lock_group`. The
      Group button is disabled in that state and the Ungroup button takes
      precedence. */
  allShareGroup: boolean;
  /** True if any selected entry has a `lock_group` set. Drives the Ungroup
      button's enabled state. */
  anyHasGroup: boolean;
  onClear: () => void;
  onSelectAll: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
  onRemove: () => void;
  isBusy?: boolean;
}

export function PlaysetSelectionToolbar({
  selectedCount,
  totalCount,
  allShareGroup,
  anyHasGroup,
  onClear,
  onSelectAll,
  onEnable,
  onDisable,
  onLock,
  onUnlock,
  onGroup,
  onUngroup,
  onMoveToTop,
  onMoveToBottom,
  onRemove,
  isBusy,
}: PlaysetSelectionToolbarProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 p-2 text-[11px]">
      <span className="font-medium text-foreground">
        {selectedCount} selected
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="text-[11px]"
        onClick={allSelected ? onClear : onSelectAll}
        disabled={isBusy}
      >
        {allSelected ? "Clear" : "Select all"}
      </Button>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onEnable}
        disabled={isBusy}
        title="Enable selected"
        aria-label="Enable selected"
      >
        <IconPlayerPlay className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDisable}
        disabled={isBusy}
        title="Disable selected"
        aria-label="Disable selected"
      >
        <IconPlayerStop className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onLock}
        disabled={isBusy}
        title="Lock selected positions"
        aria-label="Lock selected positions"
      >
        <IconLock className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onUnlock}
        disabled={isBusy}
        title="Unlock selected positions"
        aria-label="Unlock selected positions"
      >
        <IconLockOpen className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onGroup}
        disabled={isBusy || selectedCount < 2 || allShareGroup}
        title="Group selected — keep them adjacent during auto-fix"
        aria-label="Group selected"
      >
        <IconLink className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onUngroup}
        disabled={isBusy || !anyHasGroup}
        title="Ungroup selected — remove from any sticky cluster"
        aria-label="Ungroup selected"
      >
        <IconLinkOff className="size-3.5" />
      </Button>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onMoveToTop}
        disabled={isBusy}
        title="Move selected to top"
        aria-label="Move selected to top"
      >
        <IconChevronsUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onMoveToBottom}
        disabled={isBusy}
        title="Move selected to bottom"
        aria-label="Move selected to bottom"
      >
        <IconChevronsDown className="size-3.5" />
      </Button>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        disabled={isBusy}
        title="Remove selected from playset"
        aria-label="Remove selected from playset"
        className="text-destructive hover:text-destructive"
      >
        <IconTrash className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        disabled={isBusy}
        title="Clear selection"
        aria-label="Clear selection"
        className="ml-auto"
      >
        <IconX className="size-3.5" />
      </Button>
    </div>
  );
}
