/**
 * CommissionReportNew.jsx
 * Screen 31 — Commission Report (Pencil frame qgoUV)
 * BreadcrumbTopBar + KPIs, commission data table
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['thisMonth', 'lastMonth', 'quarter'];

const kpis = [
  { label: 'Total Commission', value: '$42,680', sub: '+8.3% vs last month', subColor: '#22C55E' },
  { label: 'Avg Commission Rate', value: '15.0%', sub: 'Flat rate' },
  { label: 'Top Earner', value: '$6,353', valueColor: 'hsl(var(--lu-primary))', sub: 'TechElite Store', subColor: 'hsl(var(--lu-foreground))' },
  { label: 'Pending Payouts', value: '$12,450', valueColor: '#F59E0B', sub: '23 sellers awaiting', subColor: '#F59E0B' },
];

const rows = [
  { initials: 'TE', name: 'TechElite Store', color: 'hsl(var(--lu-primary))', gmv: '$42,350', rate: '15%', commission: '$6,353', status: 'Paid', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { initials: 'GG', name: 'GadgetGuru', color: '#3B82F6', gmv: '$38,720', rate: '15%', commission: '$5,808', status: 'Paid', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { initials: 'DH', name: 'Digital Haven', color: '#8B5CF6', gmv: '$31,450', rate: '15%', commission: '$4,718', status: 'Pending', statusColor: '#F59E0B', statusBg: '#F59E0B15' },
  { initials: 'SM', name: 'SmartMart', color: '#EF4444', gmv: '$28,190', rate: '15%', commission: '$4,229', status: 'Paid', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { initials: 'NW', name: 'NextWave Electronics', color: '#06B6D4', gmv: '$22,810', rate: '15%', commission: '$3,422', status: 'Pending', statusColor: '#F59E0B', statusBg: '#F59E0B15' },
];

export default function CommissionReportNew() {
  const [activePeriod, setActivePeriod] = useState('thisMonth');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Marketplace', 'Commission Report']}
        rightContent={
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-border rounded-full overflow-hidden">
              {periodOpts.map((p) => (
                <button key={p} onClick={() => setActivePeriod(p)}
                  className={`h-7 px-3 font-secondary text-xs font-medium transition-colors ${activePeriod === p ? 'bg-primary text-white' : 'bg-background text-foreground'}`}>
                  {p === 'thisMonth' ? 'This Month' : p === 'lastMonth' ? 'Last Month' : 'Quarter'}
                </button>
              ))}
            </div>
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">download</span>Export
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="font-primary text-xl font-bold text-foreground">Commission Report</h1>
          <span className="font-secondary text-[11px] font-medium text-muted-foreground bg-secondary rounded-full px-3 py-1">February 2026</span>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
              <span className="font-secondary text-xs font-medium text-muted-foreground">{k.label}</span>
              <span className="font-primary text-2xl font-bold" style={{ color: k.valueColor || 'hsl(var(--lu-foreground))' }}>{k.value}</span>
              <span className="font-secondary text-[11px]" style={{ color: k.subColor || 'hsl(var(--lu-muted-foreground))' }}>{k.sub}</span>
            </div>
          ))}
        </div>

        {/* Commission Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center bg-secondary px-5 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Seller</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 90 }}>GMV</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 60 }}>Rate</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 90 }}>Commission</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Status</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.initials} className={`flex items-center px-5 py-3 ${i < rows.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="flex items-center gap-2 flex-1">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: r.color }}>
                  <span className="font-primary text-[10px] font-semibold text-white">{r.initials}</span>
                </div>
                <span className="font-secondary text-xs font-semibold text-foreground">{r.name}</span>
              </div>
              <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 90 }}>{r.gmv}</span>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 60 }}>{r.rate}</span>
              <span className="font-primary text-xs font-semibold text-primary text-right" style={{ width: 90 }}>{r.commission}</span>
              <div className="flex justify-end" style={{ width: 80 }}>
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: r.statusBg, color: r.statusColor }}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
