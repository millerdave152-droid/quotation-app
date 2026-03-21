/**
 * POSRuleAuditLogNew.jsx
 * Screen 33 — POS Rule Audit Log (Pencil frame B6omx)
 * QuotifySidebar + header, filters, audit data table
 */

// removed — MainLayout provides sidebar

const auditRows = [
  { time: 'Feb 28, 2026 09:14', user: 'Sarah Mitchell', action: 'Created', actionColor: '#059669', actionBg: '#D1FAE5', rule: 'Discount Override', code: 'DISC-001', details: 'Threshold set to 15%' },
  { time: 'Feb 27, 2026 16:45', user: 'Mike Johnson', action: 'Modified', actionColor: '#2563EB', actionBg: '#DBEAFE', rule: 'Refund Approval', code: 'RFND-001', details: 'Level changed: Shift Lead → Manager' },
  { time: 'Feb 27, 2026 11:22', user: 'Sarah Mitchell', action: 'Disabled', actionColor: '#DC2626', actionBg: '#FEE2E2', rule: 'Split Transaction', code: 'SPLT-002', details: 'Rule deactivated for review' },
  { time: 'Feb 26, 2026 08:30', user: 'Admin System', action: 'Escalated', actionColor: '#D97706', actionBg: '#FEF3C7', rule: 'Price Override', code: 'PRCE-001', details: 'Auto-escalated to Area Manager' },
];

export default function POSRuleAuditLogNew() {
  return (
    <div className="p-8 flex flex-col gap-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-primary text-2xl font-bold text-foreground">Rule Audit Log</h1>
            <p className="font-secondary text-[14px] text-muted-foreground">Track all approval rule changes and administrative actions</p>
          </div>
          <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
            <span className="material-symbols-rounded text-sm">download</span>Export Log
          </button>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-[280px] rounded-lg border border-border bg-background px-3 flex items-center gap-2">
            <span className="material-symbols-rounded text-sm text-muted-foreground">search</span>
            <span className="font-secondary text-sm text-muted-foreground">Search audit log...</span>
          </div>
          <div className="h-9 w-[180px] rounded-lg border border-border bg-background px-3 flex items-center justify-between">
            <span className="font-secondary text-sm text-foreground">All Actions</span>
            <span className="material-symbols-rounded text-sm text-muted-foreground">expand_more</span>
          </div>
          <div className="h-9 w-[180px] rounded-lg border border-border bg-background px-3 flex items-center justify-between">
            <span className="font-secondary text-sm text-foreground">All Users</span>
            <span className="material-symbols-rounded text-sm text-muted-foreground">expand_more</span>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center bg-secondary px-4 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 160 }}>Timestamp</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 140 }}>User</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 120 }}>Action</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Rule / Target</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 200 }}>Details</span>
          </div>
          {auditRows.map((r, i) => (
            <div key={r.code} className={`flex items-center px-4 py-3 ${i < auditRows.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="font-secondary text-xs text-muted-foreground" style={{ width: 160 }}>{r.time}</span>
              <span className="font-secondary text-xs text-foreground" style={{ width: 140 }}>{r.user}</span>
              <div style={{ width: 120 }}>
                <span className="font-secondary text-[10px] font-semibold rounded-md px-2 py-1" style={{ background: r.actionBg, color: r.actionColor }}>{r.action}</span>
              </div>
              <div className="flex flex-col flex-1">
                <span className="font-secondary text-xs font-semibold text-foreground">{r.rule}</span>
                <span className="font-primary text-[10px] text-muted-foreground">{r.code}</span>
              </div>
              <span className="font-secondary text-xs text-muted-foreground" style={{ width: 200 }}>{r.details}</span>
            </div>
          ))}
        </div>
    </div>
  );
}
