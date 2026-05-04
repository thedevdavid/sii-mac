import { IconInfoCircle } from "@tabler/icons-react";
import { Button } from "@/components/cupertino/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LOAD_ORDER_GROUPS } from "./load-order";

/**
 * Discoverable info button + popover that explains the load-order convention
 * used by Auto-fix. Triggered from the playset editor header.
 */
export function LoadOrderPopover() {
  return (
    <Popover>
      <PopoverTrigger
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
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-h-96 overflow-y-auto">
        <PopoverHeader>
          <PopoverTitle>Recommended load order</PopoverTitle>
          <PopoverDescription>
            SCS publishes no official ordering — this follows community
            convention. Top entries override anything below; place mods
            you want winning conflicts higher.
          </PopoverDescription>
        </PopoverHeader>
        <ol className="space-y-1 text-[11px]">
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
      </PopoverContent>
    </Popover>
  );
}
