import {
  Dialog,
  DialogContent,
} from "@/components/cupertino/dialog";
import type { GameBasePath } from "@/lib/core-types";
import type { Playset } from "./types";
import { PlaysetNameForm } from "./playset-name-form";
import { useDuplicatePlayset } from "./use-playset-mutations";

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
  const duplicateMutation = useDuplicatePlayset(basePath);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {playset && (
          <PlaysetNameForm
            key={playset.id}
            title="Duplicate playset"
            description={`Copy "${playset.name}" into a new playset.`}
            fieldLabel="New name"
            fieldId="dup-playset-name"
            initialValue={`${playset.name} copy`}
            submitLabel="Duplicate"
            onCancel={() => onOpenChange(false)}
            onSubmit={async (name) => {
              await duplicateMutation.mutateAsync({
                playsetId: playset.id,
                newName: name,
              });
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
