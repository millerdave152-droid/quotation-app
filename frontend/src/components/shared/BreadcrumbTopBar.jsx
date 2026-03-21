/**
 * BreadcrumbTopBar.jsx — Shared Component
 * TeleTime design system breadcrumb navigation bar
 *
 * Props:
 *   title        — array of breadcrumb segments, e.g. ['Orders', 'Purchase Orders']
 *                   First is mid-crumb (muted), last is current page (foreground).
 *   rightContent — ReactNode rendered on the right side
 */

export default function BreadcrumbTopBar({ title = [], rightContent }) {
  return (
    <>
      <div className="flex items-center justify-between h-[52px] px-6 bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-primary font-primary text-[13px] font-bold">
            LUNARIS
          </span>
          {title.map((segment, i) => {
            const isLast = i === title.length - 1;
            return (
              <span key={segment} className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">/</span>
                <span
                  className={`font-secondary text-xs ${
                    isLast
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {segment}
                </span>
              </span>
            );
          })}
        </div>
        {rightContent && (
          <div className="flex items-center gap-2">{rightContent}</div>
        )}
      </div>
      <div className="h-px bg-border" />
    </>
  );
}
