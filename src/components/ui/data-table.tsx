import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef as TanStackColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/cupertino/button";
import { NativeSelect } from "@/components/ui/native-select";
import { IconArrowUp, IconArrowDown, IconArrowsSort, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ColumnDef<TData> = TanStackColumnDef<TData, any>;

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  toolbar?: ReactNode;
  onRowClick?: (row: TData) => void;
  /** Stable row identity across data updates (e.g. optimistic mutations). */
  getRowId?: (row: TData, index: number) => string;
  emptyMessage?: string;
  initialSorting?: SortingState;
  columnFilters?: ColumnFiltersState;
  globalFilter?: string;
  enablePagination?: boolean;
  pageSize?: number;
  enableColumnVisibility?: boolean;
}

export function DataTable<TData>({
  columns,
  data,
  toolbar,
  onRowClick,
  getRowId,
  emptyMessage = "No data",
  initialSorting = [],
  columnFilters = [],
  globalFilter,
  enablePagination = false,
  pageSize = 20,
  enableColumnVisibility = false,
}: DataTableProps<TData>) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    getRowId,
    initialState: {
      sorting: initialSorting,
      pagination: { pageSize },
    },
    state: {
      columnFilters,
      globalFilter,
      ...(enableColumnVisibility ? { columnVisibility } : {}),
    },
    onColumnVisibilityChange: enableColumnVisibility ? setColumnVisibility : undefined,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(enablePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  const rowCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-3">
      {toolbar}
      <div className="rounded-lg border">
        <UITable>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.column.getCanSort()
                        ? "select-none"
                        : ""
                    }
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {header.column.getCanSort() && (
                        <SortIcon direction={header.column.getIsSorted()} />
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={onRowClick ? "" : ""}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-20 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </UITable>
      </div>

      {/* Pagination footer */}
      {enablePagination && rowCount > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing{" "}
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            –
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              rowCount,
            )}{" "}
            of {rowCount}
          </span>
          <div className="flex items-center gap-2">
            <NativeSelect
              value={String(table.getState().pagination.pageSize)}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-7 w-20"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}/page
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <IconChevronLeft className="size-3" />
            </Button>
            <span>
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <IconChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc")
    return <IconArrowUp className="size-3 text-foreground" />;
  if (direction === "desc")
    return <IconArrowDown className="size-3 text-foreground" />;
  return <IconArrowsSort className="size-3 text-muted-foreground/50" />;
}
