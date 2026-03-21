/**
 * RevenueAnalyticsNew.jsx
 * Screen 4 — Revenue Analytics (Pencil frame 3b0zd)
 * BreadcrumbTopBar + KPIs, adoption bars, donut, feature cards, revenue cards, table
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['7d', '30d', '60d', '90d'];

const kpis = [
  { label: 'Quotes with Features', value: '89', sub: '62.7% adoption', subColor: '#22C55E' },
  { label: 'Total Revenue', value: '$847,250', sub: '+12.4% vs prior', subColor: '#22C55E' },
  { label: 'Avg per Quote', value: '$5,966', sub: '+$420 vs prior', subColor: '#22C55E' },
  { label: 'Period', value: '30 Days', sub: 'Jan 30 — Feb 28', subColor: null },
];

const adoptionBars = [
  { label: 'Financing', pct: 78, color: 'hsl(var(--lu-secondary))' },
  { label: 'Warranties', pct: 65, color: 'hsl(var(--lu-primary))' },
  { label: 'Delivery', pct: 52, color: '#22C55E' },
  { label: 'Rebates', pct: 34, color: '#3B82F6' },
  { label: 'Trade-Ins', pct: 18, color: '#8B5CF6' },
];

const featureCards = [
  { icon: 'account_balance', color: 'hsl(var(--lu-primary))', name: 'Financing', stats: '69 quotes · $524K' },
  { icon: 'verified_user', color: '#22C55E', name: 'Warranties', stats: '58 quotes · $92.4K' },
  { icon: 'local_shipping', color: '#3B82F6', name: 'Delivery', stats: '46 quotes · $55.6K' },
  { icon: 'sell', color: '#F59E0B', name: 'Rebates', stats: '30 quotes · $42.1K' },
  { icon: 'swap_horiz', color: '#8B5CF6', name: 'Trade-Ins', stats: '16 quotes · $28.7K' },
];

const revenueCards = [
  { label: 'Warranty Revenue', value: '$92,400', sub: '58 quotes', labelColor: '#22C55E', grad: 'linear-gradient(135deg, #22C55E20, #22C55E05)' },
  { label: 'Delivery Revenue', value: '$55,600', sub: '46 quotes', labelColor: '#3B82F6', grad: 'linear-gradient(135deg, #3B82F620, #3B82F605)' },
  { label: 'Combined Revenue', value: '$148,000', sub: '17.5% of total', labelColor: 'hsl(var(--lu-primary))', grad: 'linear-gradient(135deg, #FF840020, #FF840005)' },
];

const tableRows = [
  { id: 'QT-2026-0142', date: 'Feb 28', total: '$12,450', fin: '✓', war: '2', del: '✓', reb: '1', trade: '—' },
  { id: 'QT-2026-0141', date: 'Feb 27', total: '$8,920', fin: '✓', war: '1', del: '—', reb: '—', trade: '1' },
  { id: 'QT-2026-0140', date: 'Feb 26', total: '$6,780', fin: '—', war: '1', del: '✓', reb: '2', trade: '—' },
];

const donutSegments = [
  { label: 'Financing', pct: 44, color: 'hsl(var(--lu-primary))' },
  { label: 'Warranties', pct: 22, color: '#22C55E' },
  { label: 'Delivery', pct: 18, color: '#3B82F6' },
  { label: 'Rebates', pct: 10, color: '#F59E0B' },
  { label: 'Trade-Ins', pct: 6, color: '#8B5CF6' },
];

const donutGrad = (() => {
  let acc = 0;
  return donutSegments.map((s) => {
    const start = acc;
    acc += (s.pct / 100) * 360;
    return `${s.color} ${start}deg ${acc}deg`;
  }).join(', ');
})();

export default function RevenueAnalyticsNew() {
  const [activePeriod, setActivePeriod] = useState('30d');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Revenue Analytics']}
        rightContent={
          <div className="flex items-center gap-1">
            {periodOpts.map((p) => (
              <button key={p} onClick={() => setActivePeriod(p)}
                className={`h-8 px-3 rounded-lg font-secondary text-[11px] font-medium transition-colors ${activePeriod === p ? 'bg-primary text-white font-semibold' : 'bg-secondary text-muted-foreground'}`}>
                {p.replace('d', '')} Days
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
              <span className="font-secondary text-[11px] text-muted-foreground">{k.label}</span>
              <span className="font-primary text-[22px] font-bold text-foreground">{k.value}</span>
              <span className="font-secondary text-[11px] font-semibold" style={{ color: k.subColor || 'hsl(var(--lu-muted-foreground))' }}>{k.sub}</span>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="flex gap-4" style={{ height: 260 }}>
          {/* Feature Adoption */}
          <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border">
              <span className="font-secondary text-[13px] font-semibold text-foreground">Feature Adoption Rate</span>
            </div>
            <div className="p-4 flex flex-col gap-2.5 flex-1 justify-center">
              {adoptionBars.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="font-secondary text-[11px] text-foreground w-20 shrink-0">{b.label}</span>
                  <div className="flex-1 h-5 rounded bg-secondary">
                    <div className="h-5 rounded" style={{ width: `${b.pct}%`, background: b.color }} />
                  </div>
                  <span className="font-primary text-[11px] font-semibold text-foreground w-8 text-right">{b.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue Split Donut */}
          <div className="w-[380px] shrink-0 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border">
              <span className="font-secondary text-[13px] font-semibold text-foreground">Revenue Split</span>
            </div>
            <div className="p-4 flex items-center gap-4 flex-1">
              <div className="relative w-[100px] h-[100px] shrink-0">
                <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${donutGrad})` }} />
                <div className="absolute inset-[20px] rounded-full bg-card" />
              </div>
              <div className="flex flex-col gap-1.5">
                {donutSegments.map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                    <span className="font-secondary text-[11px] text-foreground">{s.label}</span>
                    <span className="font-primary text-[11px] text-muted-foreground">{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Feature Cards Row */}
        <div className="grid grid-cols-5 gap-3">
          {featureCards.map((f) => (
            <div key={f.name} className="bg-card border border-border rounded-[10px] p-3.5 flex flex-col gap-1">
              <span className="material-symbols-rounded text-lg" style={{ color: f.color }}>{f.icon}</span>
              <span className="font-secondary text-xs font-semibold text-foreground">{f.name}</span>
              <span className="font-secondary text-[10px] text-muted-foreground">{f.stats}</span>
            </div>
          ))}
        </div>

        {/* Revenue Cards Row */}
        <div className="grid grid-cols-3 gap-4">
          {revenueCards.map((r) => (
            <div key={r.label} className="rounded-xl p-4 flex flex-col gap-1" style={{ background: r.grad }}>
              <span className="font-secondary text-[11px] font-semibold" style={{ color: r.labelColor }}>{r.label}</span>
              <span className="font-primary text-xl font-bold text-foreground">{r.value}</span>
              <span className="font-secondary text-[10px] text-muted-foreground">{r.sub}</span>
            </div>
          ))}
        </div>

        {/* Table Card */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="font-secondary text-sm font-bold text-foreground">Recent Quotes with Features</span>
          </div>
          {/* Headers */}
          <div className="flex items-center bg-secondary h-9 px-4">
            {['Quote ID','Date','Total','Financing','Warranty','Delivery','Rebates','Trade-In'].map((h, i) => (
              <span key={h} className="font-secondary text-[11px] font-semibold text-muted-foreground"
                style={{ width: i === 0 ? 140 : i === 2 ? 120 : i === 1 ? 100 : 80 }}>
                {h}
              </span>
            ))}
          </div>
          <div className="h-px bg-border" />
          {tableRows.map((r, ri) => (
            <div key={r.id}>
              <div className="flex items-center h-[38px] px-4">
                <span className="font-primary text-xs font-semibold text-primary" style={{ width: 140 }}>{r.id}</span>
                <span className="font-secondary text-xs text-foreground" style={{ width: 100 }}>{r.date}</span>
                <span className="font-primary text-xs font-semibold text-foreground" style={{ width: 120 }}>{r.total}</span>
                <span className="font-secondary text-xs font-bold" style={{ width: 80, color: r.fin === '✓' ? '#22C55E' : 'hsl(var(--lu-muted-foreground))' }}>{r.fin}</span>
                <span className="font-secondary text-xs" style={{ width: 80, color: r.war === '—' ? 'hsl(var(--lu-muted-foreground))' : 'hsl(var(--lu-foreground))' }}>{r.war}</span>
                <span className="font-secondary text-xs font-bold" style={{ width: 80, color: r.del === '✓' ? '#22C55E' : 'hsl(var(--lu-muted-foreground))' }}>{r.del}</span>
                <span className="font-secondary text-xs" style={{ width: 80, color: r.reb === '—' ? 'hsl(var(--lu-muted-foreground))' : 'hsl(var(--lu-foreground))' }}>{r.reb}</span>
                <span className="font-secondary text-xs" style={{ width: 80, color: r.trade === '—' ? 'hsl(var(--lu-muted-foreground))' : 'hsl(var(--lu-foreground))' }}>{r.trade}</span>
              </div>
              {ri < tableRows.length - 1 && <div className="h-px bg-border" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
