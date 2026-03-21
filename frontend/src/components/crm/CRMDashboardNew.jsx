/**
 * CRMDashboardNew.jsx
 * Screen 1 — CRM Dashboard (Pencil frame M0N3I)
 * QuotifySidebar + KPIs, pipeline gradient cards, activity bars,
 * right column with AI insights, leaderboard, donut, at-risk, recent quotes
 */

import { useState } from 'react';
// removed — MainLayout provides sidebar

const periods = ['7d', '30d', '90d', 'YTD'];

const alerts = [
  { icon: 'schedule', text: '3 Quotes Expiring', bg: '#FEF3C7', color: '#D97706' },
  { icon: 'warning', text: '2 Stale Quotes', bg: '#FEE2E2', color: '#DC2626' },
  { icon: 'description', text: '1 Overdue Invoice', bg: '#DBEAFE', color: '#2563EB' },
  { icon: 'inventory', text: '5 Low Stock', bg: '#FEF3C7', color: '#D97706' },
  { icon: 'shopping_cart', text: '4 Pending Orders', bg: '#F3E8FF', color: '#7C3AED' },
];

const kpis = [
  { label: 'Total Quotes', value: '248', badge: '+12%', badgeBg: '#DCFCE7', badgeColor: '#16A34A', sub: '18 this week' },
  { label: 'Avg Quote Value', value: '$4,850', badge: '+8%', badgeBg: '#DCFCE7', badgeColor: '#16A34A', sub: 'Per quote' },
  { label: 'Conversion Rate', value: '34%', badge: '+3%', badgeBg: '#DCFCE7', badgeColor: '#16A34A', sub: '84 closed quotes' },
  { label: 'Avg Days to Close', value: '12', badge: '+2d', badgeBg: '#FEE2E2', badgeColor: '#DC2626', sub: 'Based on 84 won quotes' },
  { label: 'Win Rate', value: '68%', badge: '+5%', badgeBg: '#DCFCE7', badgeColor: '#16A34A', sub: '168 / 248 total' },
];

const pipeline = [
  { label: 'Pipeline Value', value: '$387,450', sub: '42 active quotes (Draft + Sent)', grad: 'linear-gradient(135deg, #1E40AF, #3B82F6)', textSub: '#93C5FD', textLabel: '#BFDBFE' },
  { label: 'Won Revenue', value: '$812,300', sub: '168 won quotes', grad: 'linear-gradient(135deg, #166534, #22C55E)', textSub: '#BBF7D0', textLabel: '#BBF7D0' },
  { label: 'Lost Value', value: '$124,580', sub: '38 lost quotes', grad: 'linear-gradient(135deg, #991B1B, #EF4444)', textSub: '#FCA5A5', textLabel: '#FECACA' },
];

const weeklyBars = [
  { label: 'W1', blue: 60, green: 30 },
  { label: 'W2', blue: 80, green: 45 },
  { label: 'W3', blue: 50, green: 20, red: 12 },
  { label: 'W4', blue: 90, green: 55 },
];

const velocityMetrics = [
  { label: 'Avg Quotes / Week', value: '6.2', delta: '+0.8 vs last quarter', up: true, good: true },
  { label: 'Days to Send', value: '1.8', delta: '-0.4 days faster', up: false, good: true },
  { label: 'Days to Close', value: '12.4', delta: '+1.2 days slower', up: true, good: false },
];

const winTiers = [
  { label: '< $1,000', pct: '82% (41/50)', w: '82%', color: '#22C55E' },
  { label: '$1,000 - $5,000', pct: '68% (54/80)', w: '68%', color: '#3B82F6' },
  { label: '$5,000 - $15,000', pct: '45% (27/60)', w: '45%', color: '#F59E0B' },
  { label: '> $15,000', pct: '28% (8/28)', w: '28%', color: '#EF4444' },
];

const timeline = [
  { icon: 'check_circle', bg: '#DCFCE7', ic: '#16A34A', title: 'Quote Won', detail: 'Acme Corp · $12,450', time: '2m ago' },
  { icon: 'send', bg: '#DBEAFE', ic: '#2563EB', title: 'Quote Sent', detail: 'TechStar Ltd · $8,200', time: '15m ago' },
  { icon: 'cancel', bg: '#FEE2E2', ic: '#DC2626', title: 'Quote Lost', detail: 'Nova Digital · $3,800', time: '1h ago' },
  { icon: 'receipt', bg: '#FEF3C7', ic: '#D97706', title: 'Invoice Created', detail: 'GlobalStore Inc · $6,350', time: '3h ago' },
  { icon: 'shopping_cart', bg: '#DCFCE7', ic: '#16A34A', title: 'ORD-2024-0156', detail: 'Acme Corp · $4,200 · Fulfilled', time: '5h ago' },
];

const salespeople = [
  { rank: '\u{1F947}', name: 'James Wilson', rev: '$248,500', stats: '72% win · 34 quotes' },
  { rank: '\u{1F948}', name: 'Sarah Chen', rev: '$198,200', stats: '68% win · 28 quotes' },
  { rank: '\u{1F949}', name: 'Mike Torres', rev: '$165,800', stats: '61% win · 22 quotes' },
];

const pipeDist = [
  { label: 'Draft', count: 24, value: '$84,200', color: '#94A3B8', deg: 35 },
  { label: 'Sent', count: 18, value: '$303,250', color: '#3B82F6', deg: 26 },
  { label: 'Won', count: 168, value: '$812,300', color: '#22C55E', deg: 244 },
  { label: 'Lost', count: 38, value: '$124,580', color: '#EF4444', deg: 55 },
];

const atRisk = [
  { name: 'GlobalStore Inc', idle: '98d idle', idleBg: '#FEE2E2', idleColor: '#DC2626', risk: 'HIGH', riskBg: '#DC2626' },
  { name: 'TechStar Ltd', idle: '67d idle', idleBg: '#FEF3C7', idleColor: '#D97706', risk: 'MED', riskBg: '#D97706' },
  { name: 'Nova Digital', idle: '52d idle', idleBg: '#FEF3C7', idleColor: '#D97706' },
];

const recentQuotes = [
  { id: 'QT-2024-0251', client: 'TechStar Ltd', value: '$8,200', status: 'Sent', statusBg: '#DBEAFE', statusColor: '#2563EB' },
  { id: 'QT-2024-0250', client: 'Acme Corp', value: '$12,450', status: 'Won', statusBg: '#DCFCE7', statusColor: '#16A34A' },
  { id: 'QT-2024-0249', client: 'Nova Digital', value: '$3,800', status: 'Draft', statusBg: 'hsl(var(--lu-secondary))', statusColor: 'hsl(var(--lu-muted-foreground))' },
];

// Build conic-gradient for donut
const donutGrad = (() => {
  let acc = 0;
  return pipeDist.map((s) => {
    const start = acc;
    acc += s.deg;
    return `${s.color} ${start}deg ${acc}deg`;
  }).join(', ');
})();

export default function CRMDashboardNew() {
  const [activePeriod, setActivePeriod] = useState('7d');

  return (
    <div className="flex flex-col gap-6 p-7 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="font-primary text-2xl font-bold text-foreground">Dashboard</h1>
              <p className="font-secondary text-sm text-muted-foreground">Welcome back, Sarah. Here&apos;s your business overview.</p>
            </div>
            <div className="flex items-center gap-2.5">
              {periods.map((p) => (
                <button key={p} onClick={() => setActivePeriod(p)}
                  className={`font-primary text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors ${activePeriod === p ? 'bg-primary text-white' : 'bg-secondary text-foreground'}`}>
                  {p === 'YTD' ? 'YTD' : `${p.replace('d', '')} Days`}
                </button>
              ))}
              <button className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground">
                <span className="material-symbols-sharp text-sm">refresh</span>
              </button>
              <button className="bg-primary text-primary-foreground font-primary text-xs font-medium px-4 py-2 rounded-full">+ New Quote</button>
            </div>
          </div>

          {/* Quick-Action Strip */}
          <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
            {alerts.map((a) => (
              <div key={a.text} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={{ background: a.bg }}>
                <span className="material-symbols-sharp text-base" style={{ color: a.color }}>{a.icon}</span>
                <span className="font-primary text-xs font-semibold" style={{ color: a.color }}>{a.text}</span>
              </div>
            ))}
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-5 gap-4">
            {kpis.map((k) => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-secondary text-xs font-medium text-muted-foreground">{k.label}</span>
                  <span className="font-primary text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ background: k.badgeBg, color: k.badgeColor }}>{k.badge}</span>
                </div>
                <span className="font-primary text-[28px] font-bold text-foreground">{k.value}</span>
                <div className="h-6 w-10 rounded bg-secondary/20" />
                <span className="font-secondary text-[11px] text-muted-foreground">{k.sub}</span>
              </div>
            ))}
          </div>

          {/* Pipeline Row */}
          <div className="grid grid-cols-3 gap-4">
            {pipeline.map((p) => (
              <div key={p.label} className="rounded-xl p-5 flex flex-col gap-1.5" style={{ background: p.grad }}>
                <span className="font-secondary text-xs font-medium" style={{ color: p.textLabel }}>{p.label}</span>
                <span className="font-primary text-2xl font-bold text-white">{p.value}</span>
                <span className="font-secondary text-xs" style={{ color: p.textSub }}>{p.sub}</span>
              </div>
            ))}
          </div>

          {/* Activity Row */}
          <div className="flex gap-5">
            {/* Weekly Activity */}
            <div className="flex-1 bg-card border border-border rounded-xl">
              <div className="px-5 py-4 border-b border-border">
                <span className="font-primary text-[15px] font-semibold text-foreground">Weekly Activity</span>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div className="flex items-end gap-2 h-[140px]">
                  {weeklyBars.map((w) => (
                    <div key={w.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                      <div className="w-full flex flex-col gap-0.5">
                        <div className="rounded-t" style={{ height: w.blue, background: '#3B82F6' }} />
                        <div style={{ height: w.green, background: '#22C55E' }} />
                        {w.red && <div className="rounded-b" style={{ height: w.red, background: '#EF4444' }} />}
                      </div>
                      <span className="font-primary text-[10px] text-muted-foreground">{w.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  {[{ c: '#3B82F6', t: 'Created 42' }, { c: '#8B5CF6', t: 'Sent 35' }, { c: '#22C55E', t: 'Won 28' }, { c: '#EF4444', t: 'Lost 8' }].map((l) => (
                    <div key={l.t} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.c }} />
                      <span className="font-secondary text-[11px] text-muted-foreground">{l.t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sales Velocity */}
            <div className="w-[320px] shrink-0 bg-card border border-border rounded-xl">
              <div className="px-5 py-4 border-b border-border">
                <span className="font-primary text-[15px] font-semibold text-foreground">Sales Velocity (90d)</span>
              </div>
              <div className="p-5 flex flex-col gap-5">
                {velocityMetrics.map((v, i) => (
                  <div key={v.label} className={`flex flex-col gap-1 ${i < 2 ? 'pb-4 border-b border-border' : ''}`}>
                    <span className="font-secondary text-xs text-muted-foreground">{v.label}</span>
                    <span className="font-primary text-[32px] font-bold text-foreground">{v.value}</span>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-sharp text-sm" style={{ color: v.good ? '#16A34A' : '#DC2626' }}>{v.up ? 'trending_up' : 'trending_down'}</span>
                      <span className="font-secondary text-[11px]" style={{ color: v.good ? '#16A34A' : '#DC2626' }}>{v.delta}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Grid */}
          <div className="flex gap-5">
            {/* Left Column */}
            <div className="flex-1 flex flex-col gap-5">
              {/* Win Rate by Value Tier */}
              <div className="bg-card border border-border rounded-xl">
                <div className="px-5 py-4 border-b border-border">
                  <span className="font-primary text-[15px] font-semibold text-foreground">Win Rate by Value Tier</span>
                </div>
                <div className="p-5 flex flex-col gap-3">
                  {winTiers.map((t) => (
                    <div key={t.label} className="flex flex-col gap-1">
                      <div className="flex justify-between"><span className="font-secondary text-xs text-foreground">{t.label}</span><span className="font-secondary text-xs text-muted-foreground">{t.pct}</span></div>
                      <div className="h-2 rounded bg-secondary"><div className="h-2 rounded" style={{ width: t.w, background: t.color }} /></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-card border border-border rounded-xl">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <span className="font-primary text-[15px] font-semibold text-foreground">Timeline</span>
                  <span className="font-secondary text-[11px] font-medium text-primary cursor-pointer">View All</span>
                </div>
                <div className="px-5 py-3 flex flex-col">
                  {timeline.map((ev, i) => (
                    <div key={i} className={`flex items-center gap-3 py-2.5 ${i < timeline.length - 1 ? 'border-b border-border' : ''}`}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: ev.bg }}>
                        <span className="material-symbols-sharp text-sm" style={{ color: ev.ic }}>{ev.icon}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="font-primary text-xs font-semibold text-foreground">{ev.title}</span>
                        <span className="font-secondary text-[11px] text-muted-foreground">{ev.detail}</span>
                      </div>
                      <span className="font-secondary text-[11px] text-muted-foreground shrink-0">{ev.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column (340px) */}
            <div className="w-[340px] shrink-0 flex flex-col gap-5">
              {/* AI Insights */}
              <div className="bg-card border border-border rounded-xl">
                <div className="px-4 py-3.5 border-b border-border flex items-center gap-2">
                  <span className="material-symbols-sharp text-base text-primary">auto_awesome</span>
                  <span className="font-primary text-[15px] font-semibold text-foreground">AI Insights</span>
                </div>
                <div className="p-3 flex flex-col gap-2">
                  <div className="rounded-lg p-2.5 flex flex-col gap-1.5 border" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="bg-[#DC2626] text-white font-primary text-[9px] font-bold px-1.5 py-0.5 rounded">ALERT</span>
                      <span className="font-primary text-xs font-semibold" style={{ color: '#991B1B' }}>Stale Quote Alert</span>
                    </div>
                    <p className="font-secondary text-[11px] leading-relaxed" style={{ color: '#991B1B' }}>QT-0245 hasn&apos;t been updated in 14 days. Customer may lose interest.</p>
                    <button className="font-secondary text-[11px] font-medium text-primary self-start">View Quote</button>
                  </div>
                  <div className="rounded-lg p-2.5 flex flex-col gap-1.5 border" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="bg-[#D97706] text-white font-primary text-[9px] font-bold px-1.5 py-0.5 rounded">WARN</span>
                      <span className="font-primary text-xs font-semibold" style={{ color: '#92400E' }}>Churn Risk</span>
                    </div>
                    <p className="font-secondary text-[11px] leading-relaxed" style={{ color: '#92400E' }}>TechStar Ltd hasn&apos;t ordered in 45 days. CLV: $28,400.</p>
                  </div>
                </div>
              </div>

              {/* Top Salespeople */}
              <div className="bg-card border border-border rounded-xl">
                <div className="px-4 py-3.5 border-b border-border">
                  <span className="font-primary text-[15px] font-semibold text-foreground">Top Salespeople</span>
                </div>
                <div className="px-3 py-2 flex flex-col">
                  {salespeople.map((sp, i) => (
                    <div key={sp.name} className={`flex items-center gap-2.5 py-2 ${i < salespeople.length - 1 ? 'border-b border-border' : ''}`}>
                      <span className="text-base">{sp.rank}</span>
                      <span className="font-secondary text-xs font-medium text-foreground flex-1">{sp.name}</span>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-primary text-xs font-semibold text-foreground">{sp.rev}</span>
                        <span className="font-secondary text-[10px] text-muted-foreground">{sp.stats}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pipeline Distribution Donut */}
              <div className="bg-card border border-border rounded-xl">
                <div className="px-4 py-3.5 border-b border-border">
                  <span className="font-primary text-[15px] font-semibold text-foreground">Pipeline Distribution</span>
                </div>
                <div className="p-4 flex items-center gap-3">
                  <div className="relative w-[80px] h-[80px] shrink-0">
                    <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${donutGrad})` }} />
                    <div className="absolute inset-[16px] rounded-full bg-card flex items-center justify-center">
                      <span className="font-primary text-lg font-bold text-foreground">248</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    {pipeDist.map((p) => (
                      <div key={p.label} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
                        <span className="font-secondary text-xs text-foreground flex-1">{p.label}</span>
                        <span className="font-primary text-xs text-muted-foreground">{p.count}</span>
                        <span className="font-primary text-xs font-medium text-foreground">{p.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* At-Risk Customers */}
              <div className="bg-card border border-border rounded-xl">
                <div className="px-4 py-3.5 border-b border-border flex items-center gap-1.5">
                  <span className="material-symbols-sharp text-base text-[#EF4444]">warning</span>
                  <span className="font-primary text-[15px] font-semibold text-foreground">At-Risk Customers</span>
                </div>
                <div className="px-3 py-2 flex flex-col">
                  {atRisk.map((c, i) => (
                    <div key={c.name} className={`flex items-center gap-2 py-2 ${i < atRisk.length - 1 ? 'border-b border-border' : ''}`}>
                      <span className="font-secondary text-xs font-medium text-foreground flex-1">{c.name}</span>
                      <span className="font-primary text-[10px] font-semibold rounded px-1.5 py-0.5" style={{ background: c.idleBg, color: c.idleColor }}>{c.idle}</span>
                      {c.risk && <span className="font-primary text-[9px] font-bold text-white rounded px-1.5 py-0.5" style={{ background: c.riskBg }}>{c.risk}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Quotes */}
              <div className="bg-card border border-border rounded-xl">
                <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
                  <span className="font-primary text-[15px] font-semibold text-foreground">Recent Quotes</span>
                  <span className="font-secondary text-[11px] font-medium text-primary cursor-pointer">View All</span>
                </div>
                <div className="px-3 py-2 flex flex-col">
                  {recentQuotes.map((q, i) => (
                    <div key={q.id} className={`flex items-center gap-2 py-2 ${i < recentQuotes.length - 1 ? 'border-b border-border' : ''}`}>
                      <div className="flex flex-col gap-0.5 flex-1">
                        <span className="font-primary text-xs font-medium text-foreground">{q.id}</span>
                        <span className="font-secondary text-[11px] text-muted-foreground">{q.client}</span>
                      </div>
                      <span className="font-primary text-xs font-semibold text-foreground">{q.value}</span>
                      <span className="font-secondary text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: q.statusBg, color: q.statusColor }}>{q.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
                <button className="w-full h-9 bg-primary text-primary-foreground rounded-full font-primary text-xs font-medium">Create New Quote</button>
                <button className="w-full h-9 bg-secondary text-foreground rounded-full font-primary text-xs font-medium">View Analytics</button>
              </div>
            </div>
          </div>
    </div>
  );
}
