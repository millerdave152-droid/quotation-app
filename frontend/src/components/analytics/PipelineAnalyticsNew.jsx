/**
 * PipelineAnalyticsNew.jsx
 * Screen 6 — Pipeline Analytics (Pencil frame 0PHR9)
 * BreadcrumbTopBar + KPIs, conversion funnel, stage duration,
 * win/loss donut, recent deals table
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['30d', '60d', '90d'];

const kpis = [
  { label: 'Win Rate', value: '34.2%', badge: '+5.1% vs prior', badgeBg: '#22C55E15', badgeColor: '#22C55E' },
  { label: 'Avg Deal Size', value: '$5,966', badge: '+$420', badgeBg: '#22C55E15', badgeColor: '#22C55E' },
  { label: 'Pipeline Velocity', value: '$42.3K/day', badge: '+8.2%', badgeBg: '#22C55E15', badgeColor: '#22C55E' },
  { label: 'Conversion Rate', value: '68.4%', badge: '-2.1%', badgeBg: '#EF444415', badgeColor: '#EF4444' },
];

const funnelStages = [
  { label: 'Leads', count: 248, w: '100%', color: 'hsl(var(--lu-primary))' },
  { label: 'Qualified', count: 170, w: '68%', color: '#3B82F6' },
  { label: 'Proposal', count: 142, w: '57%', color: '#F59E0B' },
  { label: 'Negotiation', count: 68, w: '27%', color: '#8B5CF6' },
  { label: 'Won', count: 49, w: '20%', color: '#22C55E' },
];

const durationBars = [
  { label: 'Qualification', days: '4.2 days', w: '42%', color: 'hsl(var(--lu-primary))' },
  { label: 'Proposal', days: '5.8 days', w: '58%', color: '#3B82F6' },
  { label: 'Negotiation', days: '6.5 days', w: '65%', color: '#F59E0B' },
  { label: 'Closing', days: '3.1 days', w: '31%', color: '#22C55E' },
];

const donutSegments = [
  { label: 'Won', count: 49, pct: 34.5, color: '#22C55E' },
  { label: 'Lost', count: 38, pct: 26.8, color: '#EF4444' },
  { label: 'Pending', count: 55, pct: 38.7, color: '#F59E0B' },
];

const donutGrad = (() => {
  let acc = 0;
  return donutSegments.map((s) => {
    const start = acc;
    acc += (s.pct / 100) * 360;
    return `${s.color} ${start}deg ${acc}deg`;
  }).join(', ');
})();

const recentDeals = [
  { id: 'QT-2026-0142', name: 'Metro Designs', date: 'Feb 28', amount: '$12,450', stage: 'Negotiation', status: 'Hot', statusBg: '#EF444415', statusColor: '#EF4444' },
  { id: 'QT-2026-0141', name: 'Urban Living Co', date: 'Feb 27', amount: '$8,920', stage: 'Proposal', status: 'Warm', statusBg: '#F59E0B15', statusColor: '#D97706' },
  { id: 'QT-2026-0140', name: 'HomeStyle Plus', date: 'Feb 26', amount: '$6,340', stage: 'Qualification', status: 'New', statusBg: '#3B82F615', statusColor: '#3B82F6' },
  { id: 'QT-2026-0139', name: 'Lakeside Interiors', date: 'Feb 25', amount: '$15,780', stage: 'Closed Won', status: 'Won', statusBg: '#22C55E15', statusColor: '#22C55E' },
];

export default function PipelineAnalyticsNew() {
  const [activePeriod, setActivePeriod] = useState('30d');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Pipeline Analytics']}
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
          {/* Conversion Funnel */}
          <div className="flex-1 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-sm font-semibold text-foreground">Conversion Funnel</span>
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {funnelStages.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="font-secondary text-xs text-foreground w-20 shrink-0">{s.label}</span>
                  <div className="flex-1">
                    <div className="h-7 rounded flex items-center px-3" style={{ width: s.w, background: s.color }}>
                      <span className="font-primary text-[11px] font-bold text-white">{s.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stage Duration */}
          <div className="w-[380px] shrink-0 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-sm font-semibold text-foreground">Stage Duration</span>
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {durationBars.map((d) => (
                <div key={d.label} className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="font-secondary text-xs text-foreground">{d.label}</span>
                    <span className="font-secondary text-xs font-semibold text-foreground">{d.days}</span>
                  </div>
                  <div className="h-5 rounded bg-secondary">
                    <div className="h-5 rounded" style={{ width: d.w, background: d.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="flex gap-4" style={{ height: 320 }}>
          {/* Win/Loss Analysis */}
          <div className="w-[380px] shrink-0 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-sm font-semibold text-foreground">Win/Loss Analysis</span>
            <div className="flex items-center gap-6 flex-1">
              <div className="relative w-[120px] h-[120px] shrink-0">
                <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${donutGrad})` }} />
                <div className="absolute inset-[24px] rounded-full bg-card" />
              </div>
              <div className="flex flex-col gap-2">
                {donutSegments.map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                    <span className="font-secondary text-xs text-foreground">{s.label}</span>
                    <span className="font-primary text-xs font-bold" style={{ color: s.color }}>{s.count}</span>
                    <span className="font-secondary text-[10px] text-muted-foreground">({s.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Deals */}
          <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-secondary text-sm font-semibold text-foreground">Recent Deals</span>
              <span className="font-secondary text-[11px] font-medium text-primary cursor-pointer">View All</span>
            </div>
            <div className="flex items-center bg-secondary px-5 py-2.5">
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Deal</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Date</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Amount</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 90 }}>Stage</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Status</span>
            </div>
            <div className="flex-1 flex flex-col">
              {recentDeals.map((r, i) => (
                <div key={r.id} className={`flex items-center px-5 py-3 ${i < recentDeals.length - 1 ? 'border-b border-border' : ''}`}>
                  <div className="flex flex-col flex-1">
                    <span className="font-primary text-xs font-semibold text-primary">{r.id}</span>
                    <span className="font-secondary text-[10px] text-muted-foreground">{r.name}</span>
                  </div>
                  <span className="font-secondary text-xs text-foreground text-right" style={{ width: 70 }}>{r.date}</span>
                  <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 80 }}>{r.amount}</span>
                  <span className="font-secondary text-xs text-foreground text-right" style={{ width: 90 }}>{r.stage}</span>
                  <div className="flex justify-end" style={{ width: 70 }}>
                    <span className="font-secondary text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: r.statusBg, color: r.statusColor }}>{r.status}</span>
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
