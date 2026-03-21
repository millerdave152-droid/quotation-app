/**
 * MarketplaceOverviewNew.jsx
 * Screen 29 — Marketplace Overview (Pencil frame sgpKY)
 * BreadcrumbTopBar + KPIs, GMV trend chart, top sellers
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['30d', '90d', 'year'];

const kpis = [
  { label: 'GMV (Gross Merchandise)', value: '$284,530', sub: '+22.4% vs last period', subColor: '#22C55E' },
  { label: 'Active Sellers', value: '1,247', sub: '+84 new this period', subColor: '#22C55E' },
  { label: 'Total Orders', value: '8,934', sub: '+15.2% vs last period', subColor: '#22C55E' },
  { label: 'Platform Commission', value: '$42,680', valueColor: 'hsl(var(--lu-primary))', sub: '15% avg rate' },
];

const topSellers = [
  { initials: 'TE', name: 'TechElite Store', gmv: '$42,350', orders: '892', color: 'hsl(var(--lu-primary))' },
  { initials: 'GG', name: 'GadgetGuru', gmv: '$38,720', orders: '756', color: '#3B82F6' },
  { initials: 'DH', name: 'Digital Haven', gmv: '$31,450', orders: '634', color: '#8B5CF6' },
  { initials: 'SM', name: 'SmartMart', gmv: '$28,100', orders: '523', color: '#22C55E' },
  { initials: 'NW', name: 'NextWave Electronics', gmv: '$24,890', orders: '478', color: '#F59E0B' },
];

export default function MarketplaceOverviewNew() {
  const [activePeriod, setActivePeriod] = useState('30d');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Marketplace', 'Overview']}
        rightContent={
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-border rounded-full overflow-hidden">
              {periodOpts.map((p) => (
                <button key={p} onClick={() => setActivePeriod(p)}
                  className={`h-7 px-3 font-secondary text-xs font-medium transition-colors ${activePeriod === p ? 'bg-primary text-white' : 'bg-background text-foreground'}`}>
                  {p === '30d' ? '30 Days' : p === '90d' ? '90 Days' : 'Year'}
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
              <span className="font-secondary text-xs font-medium text-muted-foreground">{k.label}</span>
              <span className="font-primary text-2xl font-bold" style={{ color: k.valueColor || 'hsl(var(--lu-foreground))' }}>{k.value}</span>
              <span className="font-secondary text-[11px]" style={{ color: k.subColor || 'hsl(var(--lu-muted-foreground))' }}>{k.sub}</span>
            </div>
          ))}
        </div>

        {/* Mid Row */}
        <div className="flex gap-4">
          {/* GMV Trend Chart */}
          <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-secondary text-[15px] font-semibold text-foreground">GMV Trend</span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <span className="font-secondary text-[10px] text-muted-foreground">GMV</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#3B82F6' }} />
                  <span className="font-secondary text-[10px] text-muted-foreground">Orders</span>
                </div>
              </div>
            </div>
            <div className="p-5">
              {/* Placeholder chart area */}
              <div className="flex gap-2">
                {/* Y-axis labels */}
                <div className="flex flex-col justify-between h-[200px] pr-2">
                  {['$15K', '$10K', '$5K', '$0'].map((l) => (
                    <span key={l} className="font-primary text-[10px] text-muted-foreground">{l}</span>
                  ))}
                </div>
                {/* Chart area */}
                <div className="flex-1 h-[200px] relative rounded-lg overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-transparent" />
                  {/* Grid lines */}
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="absolute w-full h-px bg-border" style={{ top: `${i * 33.3}%` }} />
                  ))}
                </div>
              </div>
              {/* X-axis labels */}
              <div className="flex justify-between mt-2 pl-10">
                {['Feb 1', 'Feb 7', 'Feb 14', 'Feb 21', 'Feb 28'].map((d) => (
                  <span key={d} className="font-secondary text-[10px] text-muted-foreground">{d}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Top Sellers */}
          <div className="w-[380px] shrink-0 bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-secondary text-[15px] font-semibold text-foreground">Top Sellers</span>
              <span className="font-secondary text-[11px] text-muted-foreground">By GMV</span>
            </div>
            <div className="flex items-center bg-secondary px-4 py-2">
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Seller</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>GMV</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 60 }}>Orders</span>
            </div>
            {topSellers.map((s, i) => (
              <div key={s.initials} className={`flex items-center px-4 py-2.5 ${i < topSellers.length - 1 ? 'border-b border-border' : ''}`}>
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: s.color }}>
                    <span className="font-primary text-[10px] font-semibold text-white">{s.initials}</span>
                  </div>
                  <span className="font-secondary text-xs text-foreground">{s.name}</span>
                </div>
                <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 80 }}>{s.gmv}</span>
                <span className="font-primary text-xs text-foreground text-right" style={{ width: 60 }}>{s.orders}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
