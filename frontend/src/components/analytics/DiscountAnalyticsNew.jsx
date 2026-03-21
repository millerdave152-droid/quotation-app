/**
 * DiscountAnalyticsNew.jsx
 * Screen 9 — Discount Analytics (Pencil frame jXt1Y)
 * BreadcrumbTopBar + KPIs, discount distribution bars,
 * discount by category bars, recent requests table
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['30d', '60d', '90d'];

const kpis = [
  { label: 'Total Discounts', value: '$124,500', badge: '+15.2%', badgeBg: '#EF444415', badgeColor: '#EF4444' },
  { label: 'Avg Discount Rate', value: '8.4%', badge: 'of total revenue', badgeBg: 'hsl(var(--lu-secondary))', badgeColor: 'hsl(var(--lu-muted-foreground))' },
  { label: 'Quotes with Discounts', value: '67%', badge: '95 of 142', badgeBg: 'hsl(var(--lu-secondary))', badgeColor: 'hsl(var(--lu-muted-foreground))' },
  { label: 'Approval Required', value: '12', badge: 'pending', badgeBg: '#F59E0B15', badgeColor: '#D97706' },
];

const distBars = [
  { label: '0-5%', h: 160, color: 'hsl(var(--lu-primary))' },
  { label: '5-10%', h: 120, color: 'hsl(var(--lu-primary))' },
  { label: '10-15%', h: 80, color: '#FF840080' },
  { label: '15-20%', h: 45, color: '#FF840060' },
  { label: '20%+', h: 20, color: '#EF4444' },
];

const categoryBars = [
  { label: 'Living Room', amount: '$42,300', rate: '9.2%', w: '92%', color: 'hsl(var(--lu-primary))' },
  { label: 'Bedroom', amount: '$31,800', rate: '7.8%', w: '78%', color: '#F59E0B' },
  { label: 'Dining', amount: '$28,400', rate: '8.1%', w: '81%', color: '#3B82F6' },
  { label: 'Office', amount: '$22,000', rate: '6.5%', w: '65%', color: '#8B5CF6' },
];

const requestRows = [
  { id: 'QT-2026-0142', date: 'Feb 28', original: '$13,800', discount: '$1,350', rate: '9.8%', status: 'Pending', statusBg: '#F59E0B15', statusColor: '#D97706' },
  { id: 'QT-2026-0141', date: 'Feb 27', original: '$9,450', discount: '$530', rate: '5.6%', status: 'Approved', statusBg: '#22C55E15', statusColor: '#22C55E' },
  { id: 'QT-2026-0140', date: 'Feb 26', original: '$7,200', discount: '$420', rate: '5.8%', status: 'Rejected', statusBg: '#EF444415', statusColor: '#EF4444' },
];

export default function DiscountAnalyticsNew() {
  const [activePeriod, setActivePeriod] = useState('30d');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Discount Analytics']}
        rightContent={
          <div className="flex items-center bg-secondary rounded-lg p-0.5">
            {periodOpts.map((p) => (
              <button key={p} onClick={() => setActivePeriod(p)}
                className={`h-7 px-3.5 rounded-md font-secondary text-[11px] font-medium transition-colors ${activePeriod === p ? 'bg-primary text-white font-semibold' : 'text-muted-foreground'}`}>
                {p}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
              <span className="font-secondary text-xs text-muted-foreground">{k.label}</span>
              <div className="flex items-end gap-2">
                <span className="font-primary text-[28px] font-bold text-foreground">{k.value}</span>
                <span className="font-secondary text-[11px] font-semibold rounded-full px-2 py-0.5 mb-1" style={{ background: k.badgeBg, color: k.badgeColor }}>{k.badge}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="flex gap-4" style={{ height: 320 }}>
          {/* Discount Distribution */}
          <div className="flex-1 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-sm font-semibold text-foreground">Discount Distribution</span>
            <div className="flex items-end gap-4 flex-1 pb-6">
              {distBars.map((d) => (
                <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t" style={{ height: d.h, background: d.color }} />
                  <span className="font-secondary text-[10px] text-muted-foreground">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Discount by Category */}
          <div className="w-[420px] shrink-0 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-sm font-semibold text-foreground">Discount by Category</span>
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {categoryBars.map((c) => (
                <div key={c.label} className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="font-secondary text-xs text-foreground">{c.label}</span>
                    <span className="font-secondary text-xs text-muted-foreground">{c.amount} · {c.rate}</span>
                  </div>
                  <div className="h-5 rounded bg-secondary">
                    <div className="h-5 rounded" style={{ width: c.w, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Discount Requests Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="font-secondary text-sm font-semibold text-foreground">Recent Discount Requests</span>
            <span className="font-secondary text-[11px] font-medium text-primary cursor-pointer">View All</span>
          </div>
          <div className="flex items-center bg-secondary px-5 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 130 }}>Quote ID</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 80 }}>Date</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 90 }}>Original</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 90 }}>Discount</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 60 }}>Rate</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right flex-1">Status</span>
          </div>
          {requestRows.map((r, i) => (
            <div key={r.id} className={`flex items-center px-5 py-3 ${i < requestRows.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="font-primary text-xs font-semibold text-primary" style={{ width: 130 }}>{r.id}</span>
              <span className="font-secondary text-xs text-foreground" style={{ width: 80 }}>{r.date}</span>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 90 }}>{r.original}</span>
              <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 90 }}>{r.discount}</span>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 60 }}>{r.rate}</span>
              <div className="flex justify-end flex-1">
                <span className="font-secondary text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: r.statusBg, color: r.statusColor }}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
