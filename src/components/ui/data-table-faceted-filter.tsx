import { Button } from "@/components/cupertino/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IconFilter } from "@tabler/icons-react";
import { Separator } from "@/components/ui/separator";

interface FacetedFilterOption {
  label: string;
  value: string;
  count?: number;
}

interface FacetedFilterProps {
  title: string;
  options: FacetedFilterOption[];
  selected: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
}

export function DataTableFacetedFilter({
  title,
  options,
  selected,
  onSelectionChange,
}: FacetedFilterProps) {
  const hasSelection = selected.size > 0;

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onSelectionChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={hasSelection ? "border-primary/50" : ""}
          />
        }
      >
        <IconFilter className="size-3" />
        {title}
        {hasSelection && (
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {selected.size}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="space-y-1">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted"
            >
              <Checkbox
                checked={selected.has(option.value)}
                onCheckedChange={() => toggle(option.value)}
              />
              <span className="flex-1">{option.label}</span>
              {option.count != null && (
                <span className="text-muted-foreground">{option.count}</span>
              )}
            </label>
          ))}
        </div>
        {hasSelection && (
          <>
            <Separator className="my-1" />
            <button
              onClick={() => onSelectionChange(new Set())}
              className="w-full rounded-md px-2 py-1 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear filters
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
