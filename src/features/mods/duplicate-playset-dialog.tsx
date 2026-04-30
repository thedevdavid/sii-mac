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
import { useDuplicatePlayset } from "./use-playset-mutations";
import type { GameBasePath } from "@/lib/core-types";
import type { Playset } from "./types";

interface DuplicatePlaysetDialogProps {
  basePath: GameBasePath;
  playset: Playset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DuplicatePlaysetDialog({
  basePath,
  playset,
  open,
  onOpenChange,
}: DuplicatePlaysetDialogProps) {
  const [name, setName] = useState("");
  const duplicateMutation = useDuplicatePlayset(basePath);

  useEffect(() => {
    if (open && playset) setName(`${playset.name} copy`);
  }, [open, playset]);

  const trimmed = name.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playset || !trimmed) return;
    await duplicateMutation.mutateAsync({
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
            <DialogTitle>Duplicate playset</DialogTitle>
            <DialogDescription>
              Copy "{playset?.name}" into a new playset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dup-playset-name" className="text-xs">
              New name
            </Label>
            <Input
              id="dup-playset-name"
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
              disabled={!trimmed || duplicateMutation.isPending}
            >
              Duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
