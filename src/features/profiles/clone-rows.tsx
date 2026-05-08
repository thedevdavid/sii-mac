import type { ReactNode } from "react";
import { IconChevronRight, IconLock } from "@tabler/icons-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatSize, type CheckState } from "./clone-utils";
import { useId } from "react";

/**
 * Collapsible group header row: shown for each category of clone-able items
 * (config files, progress data, saves, mods). Renders the tri-state checkbox
 * that toggles the whole group plus an expand chevron when there are child
 * rows to reveal.
 */
export function GroupRow({
  icon,
  label,
  count,
  size,
  state,
  onToggle,
  disabled,
  children,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  size: number;
  state: CheckState;
  onToggle: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const hasChildren = !!children;

  return (
    <Collapsible defaultOpen={false}>
      <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50">
        {hasChildren ? (
          <CollapsibleTrigger className="group/trigger flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted">
            <IconChevronRight className="size-3.5 transition-transform group-data-[panel-open]/trigger:rotate-90" />
          </CollapsibleTrigger>
        ) : (
          <span className="size-5" />
        )}
        {disabled ? (
          <IconLock className="size-3.5 text-muted-foreground" />
        ) : (
          <Checkbox
            checked={state !== "none"}
            indeterminate={state === "some"}
            onCheckedChange={onToggle}
          />
        )}
        <span className="flex items-center gap-1.5 text-sm">
          {icon}
          <span className="font-medium">{label}</span>
          {count != null && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {count}
            </Badge>
          )}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {formatSize(size)}
        </span>
      </div>
      {hasChildren && (
        <CollapsibleContent>
          <div className="ml-7 border-l pl-3">{children}</div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

/**
 * Individual checkbox row: shown inside an expanded `GroupRow`. Displays a
 * label, an optional subtitle (e.g. last-modified timestamp), and a size.
 */
export function ItemRow({
  label,
  size,
  checked,
  onToggle,
  subtitle,
}: {
  label: string;
  size: number;
  checked: boolean;
  onToggle: () => void;
  subtitle?: string;
}) {
  const checkboxId = useId();
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <span className="size-5" />
      <Checkbox
        id={checkboxId}
        checked={checked}
        onCheckedChange={onToggle}
      />
      <Label
        htmlFor={checkboxId}
        className="min-w-0 flex-1 cursor-pointer text-sm font-normal"
      >
        <span className="truncate">{label}</span>
        {subtitle && (
          <span className="ml-2 text-xs text-muted-foreground">{subtitle}</span>
        )}
      </Label>
      <span className="text-xs text-muted-foreground">{formatSize(size)}</span>
    </div>
  );
}
