import {
  Dialog,
  DialogContent,
} from "@/components/cupertino/dialog";
import type { GameBasePath } from "@/lib/core-types";
import { PlaysetNameForm } from "./playset-name-form";
import { useCreatePlayset } from "./use-playset-mutations";

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
  const createMutation = useCreatePlayset(basePath);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <PlaysetNameForm
            title="Create playset"
            description="Name a new empty playset. You can add mods from the library afterwards."
            fieldLabel="Name"
            fieldId="create-playset-name"
            initialValue=""
            submitLabel="Create"
            onCancel={() => onOpenChange(false)}
            onSubmit={async (name) => {
              await createMutation.mutateAsync({ name });
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
