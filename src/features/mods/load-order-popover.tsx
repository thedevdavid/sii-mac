import { IconInfoCircle } from "@tabler/icons-react";
import { Button } from "@/components/cupertino/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/cupertino/dialog";
import { LOAD_ORDER_GROUPS } from "./load-order";

/**
 * Discoverable info button + dialog that explains the load-order convention
 * used by Auto-fix. Triggered from the playset editor header. A dialog (rather
 * than a popover) keeps the long ordered list scannable on small viewports
 * where a popover would clip against the window edge.
 */
export function LoadOrderPopover() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Recommended load order"
            title="Recommended load order"
          />
        }
      >
        <IconInfoCircle className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recommended load order</DialogTitle>
          <DialogDescription>
            SCS publishes no official ordering — this follows community
            convention. Top entries override anything below; place mods you
            want winning conflicts higher.
          </DialogDescription>
        </DialogHeader>
        <ol className="max-h-[60vh] space-y-1 overflow-y-auto text-[11px]">
          {LOAD_ORDER_GROUPS.map((group, i) => (
            <li
              key={group.id}
              className="flex items-start gap-2 rounded px-1 py-0.5"
            >
              <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{group.label}</div>
                <div className="text-muted-foreground">{group.description}</div>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
