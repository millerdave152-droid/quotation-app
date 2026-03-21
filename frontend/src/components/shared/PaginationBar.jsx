/**
 * PaginationBar.jsx — Shared Component
 * "Showing X-Y of Z {label}" + Previous/1/2/3/.../last/Next
 *
 * Props:
 *   current  — current page number (1-indexed)
 *   total    — total item count
 *   perPage  — items per page
 *   label    — entity name (e.g. "leads", "transactions")
 *   onPageChange — optional callback(pageNumber)
 */

export default function PaginationBar({
  current = 1,
  total = 0,
  perPage = 10,
  label = 'items',
  onPageChange,
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (current - 1) * perPage + 1;
  const end = Math.min(current * perPage, total);

  const handlePage = (pg) => {
    if (pg >= 1 && pg <= totalPages && onPageChange) {
      onPageChange(pg);
    }
  };

  // Build visible page numbers
  const pages = [];
  for (let i = 1; i <= Math.min(3, totalPages); i++) pages.push(i);
  if (totalPages > 4) pages.push('...');
  if (totalPages > 3) pages.push(totalPages);

  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-t border-border shrink-0">
      <span className="font-secondary text-xs text-muted-foreground">
        Showing {start}-{end} of {total} {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => handlePage(current - 1)}
          disabled={current <= 1}
          className="flex items-center gap-1.5 h-10 px-4 rounded-full border border-border font-primary text-sm font-medium text-foreground disabled:opacity-40"
        >
          Previous
        </button>
        {pages.map((pg, i) =>
          pg === '...' ? (
            <span
              key={`ellipsis-${i}`}
              className="font-primary text-xs text-muted-foreground px-1"
            >
              ...
            </span>
          ) : (
            <button
              key={pg}
              onClick={() => handlePage(pg)}
              className={`w-7 h-7 flex items-center justify-center rounded-md font-primary text-xs cursor-pointer ${
                pg === current
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {pg}
            </button>
          )
        )}
        <button
          onClick={() => handlePage(current + 1)}
          disabled={current >= totalPages}
          className="flex items-center gap-1.5 h-10 px-4 rounded-full border border-border font-primary text-sm font-medium text-foreground disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
