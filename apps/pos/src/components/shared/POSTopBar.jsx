/**
 * POSTopBar.jsx — Shared Component
 * TeleTime POS breadcrumb top bar
 *
 * Props:
 *   title     — Page name shown after "TeleTime POS /"
 *   subtitle  — Optional secondary text next to title
 *   rightContent — ReactNode rendered on the right side
 */

export default function POSTopBar({ title, subtitle, rightContent }) {
  return (
    <>
      <div className="flex items-center justify-between h-[52px] px-6 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-primary font-primary text-base font-bold">
            TeleTime POS
          </span>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-foreground text-sm font-semibold">
            {title}
          </span>
          {subtitle && (
            <span className="text-muted-foreground text-sm">{subtitle}</span>
          )}
        </div>
        {rightContent && (
          <div className="flex items-center gap-2">{rightContent}</div>
        )}
      </div>
      <div className="h-px bg-border" />
    </>
  );
}
