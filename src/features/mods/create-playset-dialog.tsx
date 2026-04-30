import { useState } from "react";
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
import { useCreatePlayset } from "./use-playset-mutations";
import type { GameBasePath } from "@/lib/core-types";

interface CreatePlaysetDialogProps {
  basePath: GameBasePath;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePlaysetDialog({
  basePath,
  open,
  onOpenChange,
}: CreatePlaysetDialogProps) {
  const [name, setName] = useState("");
  const createMutation = useCreatePlayset(basePath);
  const trimmed = name.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    await createMutation.mutateAsync({ name: trimmed });
    setName("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setName("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create playset</DialogTitle>
            <DialogDescription>
              Name a new empty playset. You can add mods from the library
              afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="create-playset-name" className="text-xs">
              Name
            </Label>
            <Input
              id="create-playset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Realism"
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
            <Button type="submit" disabled={!trimmed || createMutation.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
