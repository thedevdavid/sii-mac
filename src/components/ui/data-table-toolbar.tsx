import { Input } from "@/components/cupertino/input";
import { Button } from "@/components/cupertino/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconColumns3, IconX } from "@tabler/icons-react";
import type { Table } from "@tanstack/react-table";
import type { ReactNode } from "react";

interface DataTableToolbarProps<TData> {
  table?: Table<TData>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  enableColumnVisibility?: boolean;
  searchPlaceholder?: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function DataTableToolbar<TData>({
  table,
  globalFilter,
  onGlobalFilterChange,
  enableColumnVisibility,
  searchPlaceholder = "Search...",
  children,
  actions,
}: DataTableToolbarProps<TData>) {
  const isFiltered = globalFilter.length > 0;

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Input
          placeholder={searchPlaceholder}
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          className="h-7 max-w-sm"
        />
        {isFiltered && (
          <button
            onClick={() => onGlobalFilterChange("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <IconX className="size-3" />
          </button>
        )}
      </div>

      {/* Custom filter controls */}
      {children}

      {/* Column visibility */}
      {enableColumnVisibility && table && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" />}
          >
            <IconColumns3 className="size-3.5" />
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onCheckedChange={(value) => col.toggleVisibility(!!value)}
                  className="capitalize"
                >
                  {typeof col.columnDef.header === "string"
                    ? col.columnDef.header
                    : col.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Bulk actions */}
      {actions}
    </div>
  );
}
