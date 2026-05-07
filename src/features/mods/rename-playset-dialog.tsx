import {
  Dialog,
  DialogContent,
} from "@/components/cupertino/dialog";
import type { GameBasePath } from "@/lib/core-types";
import type { Playset } from "./types";
import { PlaysetNameForm } from "./playset-name-form";
import { useRenamePlayset } from "./use-playset-mutations";

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
  const renameMutation = useRenamePlayset(basePath);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {playset && (
          <PlaysetNameForm
            key={playset.id}
            title="Rename playset"
            description="Choose a new name for this playset."
            fieldLabel="Name"
            fieldId="rename-playset-name"
            initialValue={playset.name}
            submitLabel="Rename"
            validateName={(t) =>
              t === playset.name ? "Name unchanged" : undefined
            }
            onCancel={() => onOpenChange(false)}
            onSubmit={async (name) => {
              await renameMutation.mutateAsync({
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
