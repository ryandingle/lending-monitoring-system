"use client";

import { IconChevronLeft, IconChevronRight } from "./icons";

interface PaginationControlsProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  isLoading?: boolean;
  className?: string;
  pageSizeOptions?: number[];
}

export function PaginationControls({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  className = "",
  pageSizeOptions = [5, 10, 25, 50, 100],
}: PaginationControlsProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalItems === 0) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className={`flex flex-wrap items-center justify-end gap-4 text-sm text-slate-400 ${className}`}>
      {onPageSizeChange && (
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      )}
      
      <div>
        Showing {start} - {end} of {totalItems}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1 || isLoading}
          className={`rounded p-1 ${
            currentPage > 1 && !isLoading
              ? "text-slate-200 hover:bg-slate-800"
              : "pointer-events-none text-slate-600"
          }`}
          title="Previous Page"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages || isLoading}
          className={`rounded p-1 ${
            currentPage < totalPages && !isLoading
              ? "text-slate-200 hover:bg-slate-800"
              : "pointer-events-none text-slate-600"
          }`}
          title="Next Page"
        >
          <IconChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
