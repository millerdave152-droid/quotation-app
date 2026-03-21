/**
 * RuleAuditLogNew.jsx
 * Screen 32 — Rule Audit Log (Pencil frame KUfHV)
 * BreadcrumbTopBar + header, audit table, pagination
 */

import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const auditRows = [
  { time: 'Feb 28, 3:42 PM', action: 'Activated', actionColor: '#22C55E', actionBg: '#22C55E15', rule: 'High Discount Alert', by: 'Jane Wilson', prev: 'Threshold: 25%', next: 'Threshold: 20%', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { time: 'Feb 28, 2:15 PM', action: 'Modified', actionColor: '#3B82F6', actionBg: '#3B82F615', rule: 'Void After Sale Detection', by: 'Robert Lee', prev: 'Window: 10 min', next: 'Window: 5 min', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { time: 'Feb 28, 11:30 AM', action: 'Deactivated', actionColor: '#EF4444', actionBg: '#EF444415', rule: 'Duplicate Transaction Check', by: 'Karen Park', prev: 'Enabled', next: 'Disabled', nextColor: '#EF4444', status: 'Inactive', statusColor: '#EF4444', statusBg: '#EF444415' },
  { time: 'Feb 27, 4:55 PM', action: 'Created', actionColor: '#F59E0B', actionBg: '#F59E0B15', rule: 'Off-Hours Access Alert', by: 'Jane Wilson', prev: '—', next: 'Hours: 6AM-10PM', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { time: 'Feb 27, 10:20 AM', action: 'Modified', actionColor: '#3B82F6', actionBg: '#3B82F615', rule: 'Cash Drawer Variance Limit', by: 'Tom Nguyen', prev: 'Limit: $50.00', next: 'Limit: $25.00', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { time: 'Feb 26, 9:05 AM', action: 'Activated', actionColor: '#22C55E', actionBg: '#22C55E15', rule: 'Multiple Void Pattern', by: 'Robert Lee', prev: 'Count: 5 / 1hr', next: 'Count: 3 / 1hr', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
];

export default function RuleAuditLogNew() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Fraud Detection', 'Rule Audit Log']}
        rightContent={
          <div className="flex items-center gap-3">
            <div className="h-8 w-[200px] rounded-lg border border-border bg-background px-3 flex items-center gap-2">
              <span className="material-symbols-rounded text-sm text-muted-foreground">search</span>
              <span className="font-secondary text-xs text-muted-foreground">Search rules...</span>
            </div>
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">filter_list</span>Filter
            </button>
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">download</span>Export
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-primary text-xl font-bold text-foreground">Rule Audit Log</h1>
            <span className="font-secondary text-[11px] font-medium text-muted-foreground bg-secondary rounded-full px-3 py-1">156 entries</span>
          </div>
          <p className="font-secondary text-[13px] text-muted-foreground">Track all rule changes, activations, and modifications</p>
        </div>

        {/* Audit Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center bg-secondary px-5 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 160 }}>Timestamp</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 120 }}>Action</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Rule Name</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 140 }}>Modified By</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 150 }}>Previous Value</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 150 }}>New Value</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Status</span>
          </div>
          {auditRows.map((r, i) => (
            <div key={r.rule} className={`flex items-center px-5 py-3 ${i < auditRows.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="font-secondary text-xs text-muted-foreground" style={{ width: 160 }}>{r.time}</span>
              <div style={{ width: 120 }}>
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: r.actionBg, color: r.actionColor }}>{r.action}</span>
              </div>
              <span className="font-secondary text-xs font-semibold text-foreground flex-1">{r.rule}</span>
              <span className="font-secondary text-xs text-foreground" style={{ width: 140 }}>{r.by}</span>
              <span className="font-primary text-[11px] text-muted-foreground" style={{ width: 150 }}>{r.prev}</span>
              <span className="font-primary text-[11px]" style={{ width: 150, color: r.nextColor || 'hsl(var(--lu-foreground))' }}>{r.next}</span>
              <div className="flex justify-end" style={{ width: 80 }}>
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: r.statusBg, color: r.statusColor }}>{r.status}</span>
              </div>
            </div>
          ))}

          {/* Pagination Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="font-secondary text-[11px] text-muted-foreground">Showing 1-6 of 156 entries</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, '...', 26].map((p, i) => (
                <button key={i}
                  className={`w-7 h-7 rounded-md flex items-center justify-center font-primary text-xs font-medium ${p === 1 ? 'bg-primary text-white' : 'text-foreground hover:bg-secondary'}`}>
                  {p}
                </button>
              ))}
              <button className="w-7 h-7 rounded-md flex items-center justify-center border border-border">
                <span className="material-symbols-rounded text-sm text-muted-foreground">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
