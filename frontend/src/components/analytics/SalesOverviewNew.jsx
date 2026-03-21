/**
 * SalesOverviewNew.jsx
 * Screen 13 — Sales Overview (Pencil frame ZgkMZ)
 * BreadcrumbTopBar + KPIs, hourly sales paired bars,
 * top registers, top categories
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['Today', 'Week', 'Month', 'Year'];

const kpis = [
  { label: "Today's Revenue", value: '$12,847.50', sub: '+8.3% vs yesterday', subColor: '#22C55E' },
  { label: 'Transactions', value: '284', sub: '+14 vs yesterday', subColor: '#22C55E' },
  { label: 'Avg Transaction', value: '$45.24', sub: '-$1.20 vs yesterday', subColor: '#EF4444' },
  { label: 'Items per Transaction', value: '3.2', sub: '+0.3 vs yesterday', subColor: '#22C55E' },
];

const hourlyBars = [
  { label: '8AM', today: 40, yesterday: 30 },
  { label: '9', today: 80, yesterday: 60 },
  { label: '10', today: 120, yesterday: 100 },
  { label: '11', today: 160, yesterday: 140 },
  { label: '12PM', today: 190, yesterday: 180 },
  { label: '1PM', today: 170, yesterday: 150 },
  { label: '2PM', today: 100, yesterday: 80 },
  { label: '3PM', today: 50, yesterday: 70 },
];

const topRegisters = [
  { name: 'Register 3', amount: '$4,230' },
  { name: 'Register 1', amount: '$3,892' },
  { name: 'Register 5', amount: '$2,715' },
  { name: 'Register 2', amount: '$2,010' },
];

const topCategories = [
  { name: 'Electronics', amount: '$5,420', color: 'hsl(var(--lu-primary))' },
  { name: 'Wearables', amount: '$3,180', color: '#3B82F6' },
  { name: 'Accessories', amount: '$2,340', color: '#8B5CF6' },
  { name: 'Peripherals', amount: '$1,907', color: '#22C55E' },
];

export default function SalesOverviewNew() {
  const [activePeriod, setActivePeriod] = useState('Today');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['POS Reports', 'Sales Overview']}
        rightContent={
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              {periodOpts.map((p) => (
                <button key={p} onClick={() => setActivePeriod(p)}
                  className={`h-7 px-3 font-secondary text-[11px] font-medium transition-colors ${activePeriod === p ? 'bg-primary text-white font-semibold' : 'text-muted-foreground'}`}>
                  {p}
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
        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
              <span className="font-secondary text-[11px] text-muted-foreground">{k.label}</span>
              <span className="font-primary text-2xl font-bold text-foreground">{k.value}</span>
              <span className="font-secondary text-[11px] font-semibold" style={{ color: k.subColor }}>{k.sub}</span>
            </div>
          ))}
        </div>

        {/* Main Row */}
        <div className="flex gap-4">
          {/* Hourly Sales Chart */}
          <div className="flex-1 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-secondary text-sm font-semibold text-foreground">Hourly Sales</span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-primary" /><span className="font-secondary text-[10px] text-muted-foreground">Today</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#3B82F660' }} /><span className="font-secondary text-[10px] text-muted-foreground">Yesterday</span></div>
              </div>
            </div>
            <div className="flex items-end gap-3 flex-1" style={{ minHeight: 200 }}>
              {hourlyBars.map((h) => (
                <div key={h.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center gap-1">
                    <div className="w-[45%] rounded-t bg-primary" style={{ height: h.today }} />
                    <div className="w-[45%] rounded-t" style={{ height: h.yesterday, background: '#3B82F660' }} />
                  </div>
                  <span className="font-secondary text-[10px] text-muted-foreground">{h.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Side Column */}
          <div className="w-[340px] shrink-0 flex flex-col gap-4">
            {/* Top Registers */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
              <span className="font-secondary text-sm font-semibold text-foreground">Top Registers</span>
              {topRegisters.map((r, i) => (
                <div key={r.name} className={`flex items-center justify-between ${i < topRegisters.length - 1 ? 'pb-2.5 border-b border-border' : ''}`}>
                  <span className="font-secondary text-xs text-foreground">{r.name}</span>
                  <span className="font-primary text-xs font-semibold text-foreground">{r.amount}</span>
                </div>
              ))}
            </div>

            {/* Top Categories */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
              <span className="font-secondary text-sm font-semibold text-foreground">Top Categories</span>
              {topCategories.map((c, i) => (
                <div key={c.name} className={`flex items-center justify-between ${i < topCategories.length - 1 ? 'pb-2.5 border-b border-border' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="font-secondary text-xs text-foreground">{c.name}</span>
                  </div>
                  <span className="font-primary text-xs font-semibold text-foreground">{c.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
