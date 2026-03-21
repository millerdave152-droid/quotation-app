/**
 * PendingAmendmentsNew.jsx — Screen 61
 * TeleTime Design System · Pending Amendments
 * Design frame: kR5oK
 */

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const typeBadges = {
  qty_changed: { label: 'Qty Changed', bg: '#F59E0B15', color: '#F59E0B' },
  item_removed: { label: 'Item Removed', bg: '#EF444415', color: '#EF4444' },
  price_changed: { label: 'Price Changed', bg: '#8B5CF615', color: '#8B5CF6' },
  item_added: { label: 'Item Added', bg: '#22C55E15', color: '#22C55E' },
};

const rows = [
  { id: 'AMD-2026-008', order: 'ORD-2026-847', customer: 'Acme Industries', by: 'Sarah Miller', date: 'Feb 25', type: 'qty_changed', impact: '+$259.90', impactColor: '#EF4444' },
  { id: 'AMD-2026-007', order: 'ORD-2026-832', customer: 'TechWorld Corp', by: 'John Davis', date: 'Feb 24', type: 'item_removed', impact: '-$149.99', impactColor: '#22C55E' },
  { id: 'AMD-2026-006', order: 'ORD-2026-819', customer: 'Green Solutions Ltd', by: 'Emily Chen', date: 'Feb 23', type: 'price_changed', impact: '+$42.50', impactColor: '#EF4444' },
  { id: 'AMD-2026-005', order: 'ORD-2026-801', customer: 'Nova Dynamics', by: 'Mark Wilson', date: 'Feb 22', type: 'item_added', impact: '+$389.00', impactColor: '#EF4444' },
  { id: 'AMD-2026-004', order: 'ORD-2026-795', customer: 'Pinnacle Systems', by: 'Lisa Park', date: 'Feb 21', type: 'qty_changed', impact: '-$75.00', impactColor: '#22C55E' },
];

const cols = [
  { label: 'Amendment #', w: 'w-[110px]' },
  { label: 'Order #', w: 'w-[110px]' },
  { label: 'Customer', w: 'flex-1' },
  { label: 'Requested By', w: 'w-[100px]' },
  { label: 'Date', w: 'w-[80px]' },
  { label: 'Type', w: 'w-[90px]' },
  { label: 'Impact', w: 'w-[80px] text-right' },
  { label: 'Actions', w: 'w-[160px] text-right' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PendingAmendmentsNew() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Orders', 'Pending Amendments']}
        rightContent={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: '#22C55E15' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              <span className="text-[#22C55E] font-secondary text-[10px] font-medium">Auto-refresh: 30s</span>
            </div>
            <button className="h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm">
              Newest First
            </button>
          </div>
        }
      />

      <div className="flex-1 flex flex-col gap-4 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center">
          <h1 className="text-foreground font-secondary text-[20px] font-bold">Pending Amendments</h1>
          <div className="flex-1" />
          <span className="px-2.5 py-1 rounded-full font-secondary text-[11px] font-medium" style={{ backgroundColor: '#F59E0B15', color: '#F59E0B' }}>
            8 awaiting approval
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-end gap-2.5">
          <div className="flex flex-col gap-1.5 w-[274px]">
            <span className="text-foreground font-secondary text-sm font-medium">From Date</span>
            <div className="h-10 flex items-center px-4 rounded-lu-pill bg-background border border-input">
              <span className="text-muted-foreground font-secondary text-sm">2026-02-01</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-[274px]">
            <span className="text-foreground font-secondary text-sm font-medium">To Date</span>
            <div className="h-10 flex items-center px-4 rounded-lu-pill bg-background border border-input">
              <span className="text-muted-foreground font-secondary text-sm">2026-02-28</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-[274px]">
            <span className="text-foreground font-secondary text-sm font-medium">Type</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 px-4 rounded-lu-pill bg-background border border-input text-muted-foreground font-secondary text-sm appearance-none outline-none cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="qty_changed">Qty Changed</option>
              <option value="item_removed">Item Removed</option>
              <option value="price_changed">Price Changed</option>
              <option value="item_added">Item Added</option>
            </select>
          </div>
          <div className="flex-1 flex items-center gap-2 h-10 px-4 rounded-lu-pill border border-input bg-background">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && <X size={16} className="text-foreground cursor-pointer shrink-0" onClick={() => setSearch('')} />}
          </div>
        </div>

        {/* Table */}
        <div className="flex flex-col bg-card rounded-xl border border-border overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center px-4 py-2.5 bg-secondary">
            {cols.map((col) => (
              <span key={col.label} className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[10px] font-semibold uppercase`}>
                {col.label}
              </span>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row, i) => {
            const badge = typeBadges[row.type];
            return (
              <div
                key={row.id}
                className="flex items-center px-4 py-2.5"
                style={i < rows.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
              >
                <span className="w-[110px] shrink-0 text-foreground font-primary text-[11px] font-semibold">{row.id}</span>
                <span className="w-[110px] shrink-0 text-foreground font-primary text-[11px]">{row.order}</span>
                <span className="flex-1 shrink-0 text-foreground font-secondary text-xs">{row.customer}</span>
                <span className="w-[100px] shrink-0 text-muted-foreground font-secondary text-[11px]">{row.by}</span>
                <span className="w-[80px] shrink-0 text-muted-foreground font-secondary text-[11px]">{row.date}</span>
                <div className="w-[90px] shrink-0">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full font-secondary text-[9px] font-medium"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                </div>
                <span className="w-[80px] shrink-0 text-right font-primary text-[11px] font-semibold" style={{ color: row.impactColor }}>
                  {row.impact}
                </span>
                <div className="w-[160px] shrink-0 flex justify-end gap-1.5">
                  <button className="h-8 px-3 rounded-lu-pill border border-border font-primary text-[11px] font-medium text-foreground">
                    View
                  </button>
                  <button className="h-8 px-3 rounded-lu-pill bg-primary text-primary-foreground font-primary text-[11px] font-medium">
                    Approve
                  </button>
                  <button className="h-8 px-3 rounded-lu-pill bg-destructive text-foreground font-primary text-[11px] font-medium">
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
