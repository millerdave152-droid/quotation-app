/**
 * ErrorDetailDrawerNew.jsx
 * Screen 35 — Error Detail Drawer (Pencil frame JhGH5)
 * Fixed right-edge panel, error info, metadata, occurrences
 */

const occurrences = [
  {
    time: '2 hours ago',
    user: 'sarah@lumaries.com',
    url: '/quotes/new',
    stack: `TypeError: Cannot read property\n  'price' of undefined\n  at QuoteLineItem (line 142)\n  at renderWithHooks`,
  },
  {
    time: '5 hours ago',
    user: 'john@lumaries.com',
    url: '/quotes/Q-2026-0042/edit',
  },
];

export default function ErrorDetailDrawerNew() {
  return (
    <div className="fixed right-0 top-0 h-screen w-[540px] bg-card border-l border-border z-50 flex flex-col overflow-y-auto">
      {/* Error Header */}
      <div className="flex flex-col gap-3 px-6 py-5 border-b border-border">
        <div className="flex items-center gap-1.5">
          <span className="font-secondary text-[10px] font-semibold rounded px-2 py-0.5" style={{ background: '#FEE2E2', color: '#DC2626' }}>error</span>
          <span className="font-secondary text-[10px] font-semibold rounded px-2 py-0.5" style={{ background: '#F3E8FF', color: '#7C3AED' }}>runtime</span>
          <span className="font-secondary text-[10px] font-semibold rounded px-2 py-0.5" style={{ background: '#DBEAFE', color: '#2563EB' }}>Open</span>
        </div>
        <span className="font-primary text-[14px] font-semibold text-foreground">Cannot read property 'price' of undefined</span>
        <span className="font-mono text-xs text-muted-foreground">Fingerprint: a3f7c2d1</span>
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-2 px-6 py-4">
        <div className="flex items-center justify-between">
          <span className="font-secondary text-xs text-muted-foreground">First Seen</span>
          <span className="font-secondary text-xs text-foreground">Feb 21, 2026</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-secondary text-xs text-muted-foreground">Last Seen</span>
          <span className="font-secondary text-xs text-foreground">2 hours ago</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-secondary text-xs text-muted-foreground">Occurrences</span>
          <span className="font-primary text-xs font-bold text-destructive">47</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
        <button className="h-8 px-4 rounded-full bg-secondary text-foreground font-primary text-xs font-medium">Acknowledge</button>
        <button className="h-8 px-4 rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium flex items-center gap-1.5">
          <span className="material-symbols-rounded text-sm">check</span>Resolve
        </button>
        <button className="h-8 px-4 rounded-full text-muted-foreground font-primary text-xs font-medium hover:text-foreground transition-colors">Ignore</button>
      </div>

      {/* Recent Occurrences */}
      <div className="flex flex-col gap-3 px-6 py-4 flex-1">
        <span className="font-secondary text-[13px] font-semibold text-foreground">Recent Occurrences</span>

        {occurrences.map((o) => (
          <div key={o.time} className="rounded-lg bg-background border border-border p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-secondary text-[11px] text-muted-foreground">{o.time}</span>
              <span className="font-secondary text-[11px] text-primary">{o.user}</span>
            </div>
            <span className="font-secondary text-[11px] text-muted-foreground">URL: {o.url}</span>
            {o.stack && (
              <pre className="bg-[#1E1E1E] text-[#D4D4D4] font-mono text-[10px] rounded-lg p-3 whitespace-pre leading-relaxed">{o.stack}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
