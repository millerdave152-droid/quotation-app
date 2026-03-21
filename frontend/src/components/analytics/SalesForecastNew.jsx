/**
 * SalesForecastNew.jsx
 * Screen 5 — Sales Forecast (Pencil frame XWyHU)
 * BreadcrumbTopBar + KPIs, forecast placeholder, pipeline stage bars,
 * day-of-week bars, team forecast table
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['30d', '60d', '90d'];

const kpis = [
  { label: 'Forecasted Revenue', value: '$1,247,500', badge: '+12.4%', badgeBg: '#22C55E15', badgeColor: '#22C55E' },
  { label: 'Pipeline Value', value: '$2.4M', sub: '142 quotes' },
  { label: 'Weighted Pipeline', value: '$847,250', badge: '34.2% win rate', badgeBg: '#FF840015', badgeColor: 'hsl(var(--lu-primary))' },
  { label: 'Avg Sales Cycle', value: '18 Days', badge: '-2.3 days', badgeBg: '#22C55E15', badgeColor: '#22C55E' },
];

const pipelineStages = [
  { label: 'Proposal', value: '$845K  (42)', w: '82%', color: 'hsl(var(--lu-primary))' },
  { label: 'Negotiation', value: '$620K  (31)', w: '60%', color: '#F59E0B' },
  { label: 'Qualification', value: '$535K  (38)', w: '52%', color: '#3B82F6' },
  { label: 'Closed Won', value: '$310K  (22)', w: '30%', color: '#22C55E', valColor: '#22C55E' },
  { label: 'Closed Lost', value: '$90K  (9)', w: '9%', color: '#EF4444', valColor: '#EF4444' },
];

const dowBars = [
  { label: 'Mon', h: 140, color: 'hsl(var(--lu-primary))' },
  { label: 'Tue', h: 190, color: 'hsl(var(--lu-primary))' },
  { label: 'Wed', h: 160, color: 'hsl(var(--lu-primary))' },
  { label: 'Thu', h: 120, color: '#FF840060' },
  { label: 'Fri', h: 210, color: 'hsl(var(--lu-primary))', bold: true },
  { label: 'Sat', h: 80, color: '#FF840040' },
  { label: 'Sun', h: 50, color: '#FF840030' },
];

const teamRows = [
  { initials: 'JD', name: 'Jane Doe', pipe: '$845K', fc: '$412K', vel: 'Fast', velBg: '#22C55E15', velColor: '#22C55E' },
  { initials: 'MS', name: 'Mike Smith', pipe: '$620K', fc: '$285K', vel: 'Avg', velBg: '#FF840015', velColor: '#D97706' },
  { initials: 'SC', name: 'Sarah Chen', pipe: '$535K', fc: '$195K', vel: 'Fast', velBg: '#22C55E15', velColor: '#22C55E' },
  { initials: 'DP', name: 'David Park', pipe: '$400K', fc: '$155K', vel: 'Slow', velBg: '#EF444415', velColor: '#EF4444' },
];

export default function SalesForecastNew() {
  const [activePeriod, setActivePeriod] = useState('30d');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Sales Forecast']}
        rightContent={
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-secondary rounded-lg p-0.5">
              {periodOpts.map((p) => (
                <button key={p} onClick={() => setActivePeriod(p)}
                  className={`h-7 px-3.5 rounded-md font-secondary text-[11px] font-medium transition-colors ${activePeriod === p ? 'bg-primary text-white font-semibold' : 'text-muted-foreground'}`}>
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

      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
              <span className="font-secondary text-xs text-muted-foreground">{k.label}</span>
              <div className="flex items-end gap-2">
                <span className="font-primary text-[28px] font-bold text-foreground">{k.value}</span>
                {k.badge && (
                  <span className="font-secondary text-[11px] font-semibold rounded-full px-2 py-0.5 mb-1" style={{ background: k.badgeBg, color: k.badgeColor }}>{k.badge}</span>
                )}
                {k.sub && <span className="font-secondary text-xs text-muted-foreground mb-1">{k.sub}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="flex gap-4" style={{ height: 320 }}>
          {/* Revenue Forecast Placeholder */}
          <div className="flex-1 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-secondary text-sm font-semibold text-foreground">Revenue Forecast</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-primary" /><span className="font-secondary text-[10px] text-muted-foreground">Actual</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-primary/30" /><span className="font-secondary text-[10px] text-muted-foreground">Forecast</span></div>
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-gradient-to-b from-primary/10 to-transparent flex items-center justify-center">
              <span className="font-secondary text-sm text-muted-foreground">Revenue Forecast Chart</span>
            </div>
          </div>

          {/* Pipeline by Stage */}
          <div className="w-[420px] shrink-0 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-sm font-semibold text-foreground">Pipeline by Stage</span>
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {pipelineStages.map((s) => (
                <div key={s.label} className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="font-secondary text-xs text-foreground">{s.label}</span>
                    <span className="font-secondary text-xs font-semibold" style={{ color: s.valColor || 'hsl(var(--lu-foreground))' }}>{s.value}</span>
                  </div>
                  <div className="h-5 rounded bg-secondary">
                    <div className="h-5 rounded" style={{ width: s.w, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="flex gap-4" style={{ height: 320 }}>
          {/* Day of Week */}
          <div className="w-[420px] shrink-0 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-sm font-semibold text-foreground">Revenue by Day of Week</span>
            <div className="flex items-end gap-2 flex-1 pb-6">
              {dowBars.map((d) => (
                <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t" style={{ height: d.h, background: d.color }} />
                  <span className={`font-secondary text-[10px] ${d.bold ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sales Team Forecast */}
          <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-secondary text-sm font-semibold text-foreground">Sales Team Forecast</span>
              <span className="font-secondary text-[11px] font-medium text-primary cursor-pointer">View All</span>
            </div>
            {/* Column Headers */}
            <div className="flex items-center bg-secondary px-5 py-2.5">
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Rep</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Pipeline</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Forecast</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Velocity</span>
            </div>
            {/* Rows */}
            <div className="flex-1 flex flex-col">
              {teamRows.map((r, i) => (
                <div key={r.initials} className={`flex items-center px-5 py-3 ${i < teamRows.length - 1 ? 'border-b border-border' : ''}`}>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <span className="font-primary text-[10px] font-semibold text-foreground">{r.initials}</span>
                    </div>
                    <span className="font-secondary text-xs font-medium text-foreground">{r.name}</span>
                  </div>
                  <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 80 }}>{r.pipe}</span>
                  <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 80 }}>{r.fc}</span>
                  <div className="flex justify-end" style={{ width: 70 }}>
                    <span className="font-secondary text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: r.velBg, color: r.velColor }}>{r.vel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
