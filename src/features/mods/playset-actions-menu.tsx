import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/cupertino/button";
import {
  IconDots,
  IconPencil,
  IconCopy,
  IconDownload,
  IconTrash,
} from "@tabler/icons-react";
import type { Playset } from "./types";

interface PlaysetActionsMenuProps {
  playset: Playset;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export function PlaysetActionsMenu({
  playset,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: PlaysetActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${playset.name}`}
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <IconDots className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-xs">
        <DropdownMenuItem onClick={onRename}>
          <IconPencil className="size-3.5" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <IconCopy className="size-3.5" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <IconDownload className="size-3.5" />
          Export JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <IconTrash className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
