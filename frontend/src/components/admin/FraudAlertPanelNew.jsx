/**
 * FraudAlertPanelNew.jsx
 * Screen 18 — Fraud Alert Panel (Pencil frame JFZam)
 * BreadcrumbTopBar + sidebar filters + alert list with pagination
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const severityFilters = [
  { label: 'Critical', count: 3, color: '#EF4444', checked: true },
  { label: 'Warning', count: 5, color: '#F59E0B', checked: true },
  { label: 'Info', count: 12, checked: false },
];

const typeFilters = [
  { label: 'Void / Refund', checked: true },
  { label: 'Discount Abuse', checked: true },
  { label: 'Duplicate Txn', checked: true },
  { label: 'Off-Hours Access', checked: false },
];

const statusFilters = [
  { label: 'Open', count: 8, checked: true },
  { label: 'Investigating', count: 4, checked: true },
  { label: 'Resolved', count: 15, checked: false, muted: true },
  { label: 'Dismissed', count: 6, checked: false, muted: true },
];

const alertRows = [
  { barColor: '#EF4444', title: 'Void After Sale — TXN-4521', badge: 'Critical', badgeColor: '#EF4444', badgeBg: '#EF444415', desc: 'Transaction voided 2 minutes after completion. Amount: $245.00. Employee: Mike Smith', meta: 'Register 3 · 3 minutes ago · Void/Refund', status: 'Open', statusColor: '#EF4444', statusBg: '#EF444415', highlight: true },
  { barColor: '#EF4444', title: 'Duplicate Transaction — TXN-4518', badge: 'Critical', badgeColor: '#EF4444', badgeBg: '#EF444415', desc: 'Same amount $847.50 charged twice within 30 seconds. Customer: Sarah Johnson', meta: 'Register 1 · 12 minutes ago · Duplicate Txn', status: 'Investigating', statusColor: '#3B82F6', statusBg: '#3B82F615', highlight: true },
  { barColor: '#EF4444', title: 'Excessive Refunds — Employee #1042', badge: 'Critical', badgeColor: '#EF4444', badgeBg: '#EF444415', desc: '8 refunds processed in last 2 hours totaling $1,420. Exceeds threshold of 5 per shift.', meta: 'Register 2 · 45 minutes ago · Void/Refund', status: 'Open', statusColor: '#EF4444', statusBg: '#EF444415' },
  { barColor: '#F59E0B', title: 'High Discount Override — TXN-4510', badge: 'Warning', badgeColor: '#F59E0B', badgeBg: '#F59E0B15', desc: '35% discount applied without manager approval. Amount: $1,250.00', meta: 'Register 1 · 28 minutes ago · Discount Abuse', status: 'Open', statusColor: '#F59E0B', statusBg: '#F59E0B15' },
  { barColor: '#F59E0B', title: 'Cash Drawer Discrepancy — Register 4', badge: 'Warning', badgeColor: '#F59E0B', badgeBg: '#F59E0B15', desc: 'Cash drawer short by $47.25. Third occurrence this week for Register 4.', meta: 'Register 4 · 1 hour ago · Cash Discrepancy', status: 'Investigating', statusColor: '#3B82F6', statusBg: '#3B82F615' },
  { barColor: '#3B82F6', title: 'Off-Hours Access — John D.', badge: 'Info', badgeColor: '#3B82F6', badgeBg: '#3B82F615', desc: 'Register accessed at 11:42 PM outside business hours. Employee: John D.', meta: 'Register 2 · 1 hour ago · Off-Hours Access', status: 'Open', statusColor: '#EF4444', statusBg: '#EF444415' },
  { barColor: '#F59E0B', title: 'Price Override — TXN-4498', badge: 'Warning', badgeColor: '#F59E0B', badgeBg: '#F59E0B15', desc: 'Manual price reduction of 42% on SKU-8821. Original: $899, Charged: $521.', meta: 'Register 1 · 2 hours ago · Discount Abuse', status: 'Investigating', statusColor: '#3B82F6', statusBg: '#3B82F615' },
];

function FilterGroup({ title, items }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-secondary text-xs font-semibold text-muted-foreground">{title}</span>
      {items.map((f) => (
        <label key={f.label} className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" defaultChecked={f.checked} className="w-4 h-4 rounded border-border accent-primary" />
          <span className={`font-secondary text-xs ${f.muted ? 'text-muted-foreground' : 'text-foreground'}`}
            style={f.color ? { color: f.color } : undefined}>
            {f.label}{f.count != null ? ` (${f.count})` : ''}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function FraudAlertPanelNew() {
  const [currentPage, setCurrentPage] = useState(1);

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Fraud Detection', 'Alert Management']}
        rightContent={
          <div className="flex items-center gap-3">
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">filter_list</span>Filter
            </button>
            <button className="h-8 px-4 rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">download</span>Export
            </button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-[280px] shrink-0 bg-card border-r border-border p-5 flex flex-col gap-5 overflow-y-auto">
          <span className="font-secondary text-sm font-semibold text-foreground">Filters</span>
          <FilterGroup title="Severity" items={severityFilters} />
          <FilterGroup title="Alert Type" items={typeFilters} />
          <FilterGroup title="Status" items={statusFilters} />
          <button className="h-9 border border-border text-foreground rounded-lg font-primary text-xs font-medium flex items-center justify-center gap-1.5 mt-auto">
            <span className="material-symbols-rounded text-sm">close</span>Clear Filters
          </button>
        </div>

        {/* Alert List */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* List Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <span className="font-secondary text-sm font-semibold text-foreground">20 Alerts</span>
            <span className="font-secondary text-xs text-muted-foreground cursor-pointer">Sort: Newest First ›</span>
          </div>

          {/* Alert Rows */}
          <div className="flex-1 overflow-y-auto">
            {alertRows.map((a) => (
              <div key={a.title} className="flex items-center gap-4 px-6 py-4 border-b border-border"
                style={a.highlight ? { background: '#EF444408' } : undefined}>
                {/* Severity Bar */}
                <div className="w-1 h-10 rounded-sm shrink-0" style={{ background: a.barColor }} />
                {/* Content */}
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-secondary text-[13px] font-semibold text-foreground">{a.title}</span>
                    <span className="font-secondary text-[10px] font-semibold rounded px-1.5 py-0.5" style={{ background: a.badgeBg, color: a.badgeColor }}>{a.badge}</span>
                  </div>
                  <span className="font-secondary text-xs text-muted-foreground">{a.desc}</span>
                  <span className="font-secondary text-[10px] text-muted-foreground">{a.meta}</span>
                </div>
                {/* Status */}
                <span className="font-secondary text-[11px] font-medium rounded-full px-2.5 py-1 shrink-0" style={{ background: a.statusBg, color: a.statusColor }}>{a.status}</span>
                <span className="material-symbols-rounded text-lg text-muted-foreground">chevron_right</span>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0">
            <span className="font-secondary text-xs text-muted-foreground">Showing 1-7 of 20 alerts</span>
            <div className="flex items-center gap-1">
              <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center">
                <span className="material-symbols-rounded text-sm text-muted-foreground">chevron_left</span>
              </button>
              {[1, 2, 3].map((p) => (
                <button key={p} onClick={() => setCurrentPage(p)}
                  className={`w-8 h-8 rounded-lg font-secondary text-xs font-semibold flex items-center justify-center ${currentPage === p ? 'bg-primary text-white' : 'border border-border text-foreground'}`}>
                  {p}
                </button>
              ))}
              <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center">
                <span className="material-symbols-rounded text-sm text-muted-foreground">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
