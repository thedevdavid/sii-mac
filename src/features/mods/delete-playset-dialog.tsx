import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/cupertino/alert-dialog";
import { useDeletePlayset } from "./use-playset-mutations";
import type { GameBasePath, ProfilePath } from "@/lib/core-types";
import type { Playset } from "./types";

interface DeletePlaysetDialogProps {
  basePath: GameBasePath;
  profilePath: ProfilePath;
  playset: Playset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeletePlaysetDialog({
  basePath,
  profilePath,
  playset,
  open,
  onOpenChange,
}: DeletePlaysetDialogProps) {
  const deleteMutation = useDeletePlayset(basePath, profilePath);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete playset?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently remove <span className="font-medium">{playset?.name}</span>.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              if (!playset) return;
              await deleteMutation.mutateAsync({ playsetId: playset.id });
              onOpenChange(false);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
