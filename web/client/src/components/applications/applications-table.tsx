import { useState } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { StatusBadge } from "./status-badge";
import type { Application } from "@/lib/types";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

const columns: ColumnDef<Application>[] = [
  { accessorKey: "number", header: "#", size: 50 },
  { accessorKey: "createdAt", header: "Evaluated", cell: ({ getValue }) => {
    const d = getValue<string>(); return d ? new Date(d).toLocaleDateString() : "";
  }},
  { accessorKey: "company", header: "Company" },
  { accessorKey: "role", header: "Role" },
  { accessorKey: "score", header: "Score", cell: ({ getValue }) => {
    const s = getValue<string | null>(); return s ? `${s}/5` : "-";
  }},
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
  { accessorKey: "pdfGenerated", header: "PDF", size: 50, cell: ({ getValue }) => getValue<boolean>() ? "✅" : "❌" },
  { accessorKey: "notes", header: "Notes", cell: ({ getValue }) => (
    <span className="text-muted-foreground text-sm truncate max-w-[200px] block">{getValue<string | null>() || ""}</span>
  )},
];

export function ApplicationsTable({ data }: { data: Application[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "number", desc: true }]);

  const table = useReactTable({
    data, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b bg-muted/50">
              {hg.headers.map((header) => (
                <th key={header.id} onClick={header.column.getToggleSortingHandler()}
                  className="text-left px-4 py-3 text-sm font-medium cursor-pointer select-none">
                  <div className="flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? <ChevronUp className="h-3 w-3" /> :
                     header.column.getIsSorted() === "desc" ? <ChevronDown className="h-3 w-3" /> :
                     <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="text-center py-8 text-muted-foreground">
              No applications yet. Evaluate some jobs to get started.
            </td></tr>
          ) : table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0 hover:bg-muted/50">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 text-sm">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
