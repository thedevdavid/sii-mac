import {
  Dialog,
  DialogContent,
} from "@/components/cupertino/dialog";
import { PlaysetNameForm } from "./playset-name-form";
import { playsetActionHelp } from "./playset-actions-help";

interface SaveAsDialogProps {
  open: boolean;
  defaultName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void | Promise<void>;
}

export function SaveAsDialog({
  open,
  defaultName,
  onOpenChange,
  onSubmit,
}: SaveAsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <PlaysetNameForm
            key={defaultName}
            title="Save playset"
            description={playsetActionHelp.saveAs}
            fieldLabel="Name"
            fieldId="save-as-name"
            initialValue={defaultName}
            submitLabel="Save"
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
