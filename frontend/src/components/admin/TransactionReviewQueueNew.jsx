/**
 * TransactionReviewQueueNew.jsx
 * Screen 19 — Transaction Review Queue (Pencil frame 9Kogx)
 * BreadcrumbTopBar + status filter pills + data table with actions
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const statusFilters = [
  { label: 'All', count: 23 },
  { label: 'Pending', count: 12 },
  { label: 'Flagged', count: 5 },
  { label: 'Approved', count: 4 },
  { label: 'Rejected', count: 2 },
];

const rows = [
  { txn: 'TXN-4521', register: 'Register 3', initials: 'MS', name: 'Mike Smith', amount: '$245.00', flag: 'Void after sale (2 min)', flagColor: '#EF4444', risk: 'High (85)', riskColor: '#EF4444', riskBg: '#EF444415', status: 'Pending', statusColor: '#F59E0B', statusBg: '#F59E0B15', time: '3 min ago', highlight: true, actionable: true },
  { txn: 'TXN-4518', register: 'Register 1', initials: 'SJ', name: 'Sarah Johnson', amount: '$847.50', flag: 'Duplicate charge (30s)', flagColor: '#EF4444', risk: 'High (92)', riskColor: '#EF4444', riskBg: '#EF444415', status: 'Investigating', statusColor: '#3B82F6', statusBg: '#3B82F615', time: '12 min ago', highlight: true, actionable: true },
  { txn: 'TXN-4510', register: 'Register 1', initials: 'JD', name: 'John Davis', amount: '$1,250.00', flag: '35% discount override', flagColor: '#F59E0B', risk: 'Med (62)', riskColor: '#F59E0B', riskBg: '#F59E0B15', status: 'Pending', statusColor: '#F59E0B', statusBg: '#F59E0B15', time: '28 min ago', actionable: true },
  { txn: 'TXN-4505', register: 'Register 4', initials: 'RW', name: 'Robert Wilson', amount: '$523.00', flag: 'Cash drawer short $47', flagColor: '#F59E0B', risk: 'Med (58)', riskColor: '#F59E0B', riskBg: '#F59E0B15', status: 'Pending', statusColor: '#F59E0B', statusBg: '#F59E0B15', time: '1 hr ago', actionable: true },
  { txn: 'TXN-4498', register: 'Register 1', initials: 'LP', name: 'Lisa Park', amount: '$899.00', flag: 'Price override 42%', flagColor: '#F59E0B', risk: 'Med (55)', riskColor: '#F59E0B', riskBg: '#F59E0B15', status: 'Approved', statusColor: '#22C55E', statusBg: '#22C55E15', time: '2 hrs ago' },
  { txn: 'TXN-4492', register: 'Register 2', initials: 'AC', name: 'Amy Chen', amount: '$156.00', flag: 'No-receipt refund', flagColor: 'hsl(var(--lu-muted-foreground))', risk: 'Low (32)', riskColor: 'hsl(var(--lu-muted-foreground))', riskBg: 'hsl(var(--lu-secondary))', status: 'Rejected', statusColor: '#EF4444', statusBg: '#EF444415', time: '3 hrs ago', dimmed: true },
];

export default function TransactionReviewQueueNew() {
  const [activeFilter, setActiveFilter] = useState('All');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Transaction Review Queue']}
        rightContent={
          <div className="flex items-center gap-3">
            <span className="font-secondary text-[11px] font-semibold rounded-full px-3 py-1" style={{ background: '#F59E0B15', color: '#F59E0B' }}>12 Pending Review</span>
            <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card">
              <span className="material-symbols-rounded text-sm text-muted-foreground">search</span>
              <span className="font-secondary text-xs text-muted-foreground">Search transactions...</span>
            </div>
          </div>
        }
      />

      {/* Status Filter Bar */}
      <div className="flex items-center gap-2 px-8 py-3 bg-card border-b border-border shrink-0">
        {statusFilters.map((f) => (
          <button key={f.label} onClick={() => setActiveFilter(f.label)}
            className={`rounded-full px-3 py-1 font-secondary text-xs font-medium transition-colors ${activeFilter === f.label ? 'bg-primary text-white' : 'bg-background border border-border text-foreground'}`}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {/* Column Headers */}
        <div className="flex items-center px-8 py-2.5 border-b border-border bg-background sticky top-0">
          <span className="font-secondary text-xs font-semibold text-muted-foreground" style={{ width: 140 }}>Transaction</span>
          <span className="font-secondary text-xs font-semibold text-muted-foreground" style={{ width: 140 }}>Customer</span>
          <span className="font-secondary text-xs font-semibold text-muted-foreground text-right" style={{ width: 100 }}>Amount</span>
          <span className="font-secondary text-xs font-semibold text-muted-foreground" style={{ width: 160, paddingLeft: 16 }}>Flag Reason</span>
          <span className="font-secondary text-xs font-semibold text-muted-foreground text-center" style={{ width: 100 }}>Risk Score</span>
          <span className="font-secondary text-xs font-semibold text-muted-foreground text-center" style={{ width: 100 }}>Status</span>
          <span className="font-secondary text-xs font-semibold text-muted-foreground" style={{ width: 100 }}>Time</span>
          <span className="font-secondary text-xs font-semibold text-muted-foreground text-right flex-1">Actions</span>
        </div>

        {/* Data Rows */}
        {rows.map((r) => (
          <div key={r.txn} className={`flex items-center px-8 py-3 border-b border-border ${r.dimmed ? 'opacity-60' : ''}`}
            style={r.highlight ? { background: '#EF444408' } : undefined}>
            {/* Transaction */}
            <div className="flex flex-col" style={{ width: 140 }}>
              <span className="font-primary text-[13px] font-semibold text-foreground">{r.txn}</span>
              <span className="font-secondary text-[10px] text-muted-foreground">{r.register}</span>
            </div>
            {/* Customer */}
            <div className="flex items-center gap-2" style={{ width: 140 }}>
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <span className="font-primary text-[10px] font-semibold text-foreground">{r.initials}</span>
              </div>
              <span className="font-secondary text-xs font-medium text-foreground">{r.name}</span>
            </div>
            {/* Amount */}
            <span className="font-primary text-[13px] font-semibold text-foreground text-right" style={{ width: 100 }}>{r.amount}</span>
            {/* Flag Reason */}
            <span className="font-secondary text-xs pl-4" style={{ width: 160, color: r.flagColor }}>{r.flag}</span>
            {/* Risk Score */}
            <div className="flex justify-center" style={{ width: 100 }}>
              <span className="font-primary text-[11px] font-semibold rounded px-2 py-0.5" style={{ background: r.riskBg, color: r.riskColor }}>{r.risk}</span>
            </div>
            {/* Status */}
            <div className="flex justify-center" style={{ width: 100 }}>
              <span className="font-secondary text-[11px] font-medium rounded-full px-2 py-0.5" style={{ background: r.statusBg, color: r.statusColor }}>{r.status}</span>
            </div>
            {/* Time */}
            <span className="font-secondary text-xs text-muted-foreground" style={{ width: 100 }}>{r.time}</span>
            {/* Actions */}
            <div className="flex items-center justify-end gap-1.5 flex-1">
              {r.actionable ? (
                <>
                  <button className="flex items-center gap-1 px-2.5 py-1 rounded-md font-secondary text-[11px] font-medium" style={{ background: '#22C55E10', color: '#22C55E' }}>
                    <span className="material-symbols-rounded text-sm">check</span>Approve
                  </button>
                  <button className="flex items-center gap-1 px-2.5 py-1 rounded-md font-secondary text-[11px] font-medium" style={{ background: '#EF444410', color: '#EF4444' }}>
                    <span className="material-symbols-rounded text-sm">close</span>Reject
                  </button>
                </>
              ) : (
                <button className="px-3 py-1 rounded-md border border-border font-secondary text-[11px] font-medium text-foreground">View</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
