import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/cupertino/dialog";
import { Button } from "@/components/cupertino/button";
import { Input } from "@/components/cupertino/input";
import { Label } from "@/components/ui/label";
import { useRenamePlayset } from "./use-playset-mutations";
import type { GameBasePath } from "@/lib/core-types";
import type { Playset } from "./types";

interface RenamePlaysetDialogProps {
  basePath: GameBasePath;
  playset: Playset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenamePlaysetDialog({
  basePath,
  playset,
  open,
  onOpenChange,
}: RenamePlaysetDialogProps) {
  const [name, setName] = useState("");
  const renameMutation = useRenamePlayset(basePath);

  useEffect(() => {
    if (open && playset) setName(playset.name);
  }, [open, playset]);

  const trimmed = name.trim();
  const unchanged = trimmed === playset?.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playset || !trimmed || unchanged) return;
    await renameMutation.mutateAsync({
      playsetId: playset.id,
      newName: trimmed,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Rename playset</DialogTitle>
            <DialogDescription>
              Choose a new name for this playset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-playset-name" className="text-xs">
              Name
            </Label>
            <Input
              id="rename-playset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={128}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!trimmed || unchanged || renameMutation.isPending}
            >
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
