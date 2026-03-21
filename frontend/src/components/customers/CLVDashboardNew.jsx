/**
 * CLVDashboardNew.jsx
 * Screen 2 — CLV Dashboard (Pencil frame 122K8)
 * QuotifySidebar + stats, segment gradient cards, top customers table, churn risk
 */

import { useState } from 'react';
// removed — MainLayout provides sidebar

const segments = [
  { name: 'Platinum', icon: 'workspace_premium', threshold: '> $10,000 CLV', customers: '234', value: '$1.8M', grad: 'linear-gradient(135deg, #10B981, #059669)' },
  { name: 'Gold', icon: 'star', threshold: '$5,000 - $10,000', customers: '456', value: '$1.4M', grad: 'linear-gradient(135deg, #F59E0B, #D97706)' },
  { name: 'Silver', icon: 'diamond', threshold: '$1,000 - $5,000', customers: '892', value: '$780K', grad: 'linear-gradient(135deg, #6366F1, #4F46E5)' },
  { name: 'Bronze', icon: 'shield', threshold: '< $1,000', customers: '758', value: '$220K', grad: 'linear-gradient(135deg, #78716C, #57534E)' },
];

const topCustomers = [
  { rank: 1, name: 'John Anderson', segment: 'Platinum', segBg: '#DCFCE7', segColor: '#16A34A', clv: '$48,200', conv: '84%', orders: '24', avg: '$2,008', idle: '3d', idleColor: '#16A34A' },
  { rank: 2, name: 'Martinez Properties', segment: 'Platinum', segBg: '#DCFCE7', segColor: '#16A34A', clv: '$36,800', conv: '76%', orders: '18', avg: '$2,044', idle: '7d', idleColor: '#16A34A' },
  { rank: 3, name: 'Thompson Residences', segment: 'Gold', segBg: '#FEF3C7', segColor: '#D97706', clv: '$28,500', conv: '72%', orders: '12', avg: '$2,375', idle: '14d', idleColor: '#D97706' },
];

const riskSummary = [
  { title: 'High Risk', count: '42', sub: '$186K revenue at risk', idle: 'Avg 45 days idle', bg: '#FEF2F2', border: '#FECACA', color: '#EF4444', subColor: '#991B1B' },
  { title: 'Medium Risk', count: '85', sub: '$312K revenue at risk', idle: 'Avg 28 days idle', bg: '#FFF7ED', border: '#FED7AA', color: '#D97706', subColor: '#92400E' },
];

const atRiskRows = [
  { name: 'GlobalStore Inc', segment: 'Gold', clv: '$28,400', idle: '98', risk: 'High', riskBg: '#DC2626' },
  { name: 'TechStar Ltd', segment: 'Platinum', clv: '$36,800', idle: '67', risk: 'Medium', riskBg: '#D97706' },
  { name: 'Nova Digital', segment: 'Silver', clv: '$12,200', idle: '52', risk: 'Medium', riskBg: '#D97706' },
];

export default function CLVDashboardNew() {
  const [activeSegment] = useState('all');

  return (
    <div className="flex flex-col gap-6 p-7 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="font-secondary text-[22px] font-bold text-foreground">Customer Lifetime Value</h1>
              <p className="font-secondary text-[13px] text-muted-foreground">CLV analytics, segmentation, and churn risk analysis.</p>
            </div>
            <button className="bg-primary text-primary-foreground font-primary text-xs font-medium px-4 py-2 rounded-full flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">refresh</span>Recalculate CLV
            </button>
          </div>

          {/* Job Banner */}
          <div className="flex items-center gap-2 rounded-lg px-4 py-2.5" style={{ background: '#F0FDF4' }}>
            <span className="material-symbols-rounded text-lg" style={{ color: '#10B981' }}>check_circle</span>
            <span className="font-secondary text-xs" style={{ color: '#166534' }}>Last CLV recalculation: Feb 27, 2026 &middot; 2,847 records updated &middot; Duration: 4.2s</span>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Customers', value: '2,340', icon: 'group' },
              { label: 'Portfolio', value: '$4.2M', icon: 'account_balance_wallet' },
              { label: 'Avg CLV', value: '$1,795', icon: 'trending_up' },
              { label: 'High Risk', value: '127', icon: 'warning', valueColor: '#EF4444' },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-rounded text-base text-primary">{s.icon}</span>
                  <span className="font-secondary text-xs font-medium text-muted-foreground">{s.label}</span>
                </div>
                <span className="font-primary text-[28px] font-bold" style={{ color: s.valueColor || 'hsl(var(--lu-foreground))' }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Segment Row */}
          <div className="grid grid-cols-4 gap-4">
            {segments.map((seg) => (
              <div key={seg.name} className="rounded-xl p-5 flex flex-col gap-2" style={{ background: seg.grad }}>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-rounded text-xl text-white">{seg.icon}</span>
                  <span className="font-secondary text-sm font-bold text-white">{seg.name}</span>
                </div>
                <span className="font-secondary text-[11px] text-white/80">{seg.threshold}</span>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-primary text-xl font-bold text-white">{seg.customers}</span>
                    <span className="font-secondary text-[10px] text-white/80">Customers</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-primary text-xl font-bold text-white">{seg.value}</span>
                    <span className="font-secondary text-[10px] text-white/80">Total Value</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Top Customers Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <span className="material-symbols-rounded text-xl text-primary">leaderboard</span>
              <span className="font-secondary text-[15px] font-semibold text-foreground flex-1">Top Customers by CLV</span>
              <div className="flex items-center gap-1 bg-card border border-border rounded-md px-2.5 py-1 cursor-pointer">
                <span className="font-secondary text-xs text-foreground">{activeSegment === 'all' ? 'All Segments' : activeSegment}</span>
                <span className="material-symbols-rounded text-sm text-muted-foreground">keyboard_arrow_down</span>
              </div>
            </div>
            {/* Header */}
            <div className="flex items-center bg-secondary px-5 py-2.5">
              {['#','Customer','Segment','CLV','Conv%','Orders','Avg Order','Idle'].map((h, i) => (
                <span key={h} className="font-primary text-[11px] font-semibold text-muted-foreground"
                  style={{ width: i === 0 ? 30 : i === 1 ? undefined : i === 2 ? 80 : i === 3 ? 80 : i === 4 ? 60 : i === 5 ? 50 : i === 6 ? 70 : 40, flex: i === 1 ? 1 : undefined, textAlign: i > 2 ? 'right' : 'left' }}>
                  {h}
                </span>
              ))}
            </div>
            {/* Rows */}
            {topCustomers.map((c, i) => (
              <div key={c.rank} className={`flex items-center px-5 py-3 border-b border-border ${i % 2 === 1 ? 'bg-secondary' : ''}`}>
                <span className="font-primary text-[13px] font-bold text-primary" style={{ width: 30 }}>{c.rank}</span>
                <span className="font-secondary text-[13px] font-semibold text-foreground flex-1">{c.name}</span>
                <span className="font-secondary text-sm font-medium rounded-full px-2 py-0.5" style={{ width: 80, background: c.segBg, color: c.segColor }}>{c.segment}</span>
                <span className="font-primary text-[13px] font-semibold text-foreground text-right" style={{ width: 80 }}>{c.clv}</span>
                <span className="font-primary text-[13px] font-semibold text-right" style={{ width: 60, color: '#16A34A' }}>{c.conv}</span>
                <span className="font-primary text-[13px] text-foreground text-right" style={{ width: 50 }}>{c.orders}</span>
                <span className="font-primary text-[13px] text-foreground text-right" style={{ width: 70 }}>{c.avg}</span>
                <span className="font-primary text-[13px] text-right" style={{ width: 40, color: c.idleColor }}>{c.idle}</span>
              </div>
            ))}
          </div>

          {/* Churn Risk Section */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <span className="material-symbols-rounded text-xl" style={{ color: '#EF4444' }}>warning</span>
              <span className="font-secondary text-[15px] font-semibold text-foreground">Churn Risk Analysis</span>
              <span className="font-primary text-[11px] font-semibold rounded-full px-2.5 py-1 ml-2" style={{ background: '#FEE2E2', color: '#EF4444' }}>127 at risk</span>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {/* Risk Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                {riskSummary.map((r) => (
                  <div key={r.title} className="rounded-[10px] p-4 flex flex-col gap-1.5" style={{ background: r.bg, borderLeft: `4px solid ${r.border}` }}>
                    <span className="font-secondary text-xs font-semibold" style={{ color: r.color }}>{r.title}</span>
                    <span className="font-primary text-2xl font-bold" style={{ color: r.color }}>{r.count}</span>
                    <span className="font-secondary text-[11px]" style={{ color: r.subColor }}>{r.sub}</span>
                    <span className="font-secondary text-[10px] text-muted-foreground">{r.idle}</span>
                  </div>
                ))}
                {/* Low Risk — gradient card */}
                <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}>
                  <span className="font-secondary text-[11px] font-semibold text-white tracking-wide">Low Risk</span>
                  <span className="font-primary text-[28px] font-bold text-white">2,213</span>
                  <span className="font-secondary text-[11px] text-white/80">customers</span>
                  <div className="h-px bg-white/20 my-1" />
                  <div className="flex justify-between">
                    <span className="font-secondary text-[11px] text-white/70">Revenue secured</span>
                    <span className="font-primary text-sm font-bold text-white">$3.7M</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-secondary text-[11px] text-white/70">Avg idle days</span>
                    <span className="font-primary text-sm font-bold text-white">8 days</span>
                  </div>
                </div>
              </div>

              {/* At-Risk Table */}
              <div className="rounded-lg overflow-hidden border border-border">
                <div className="flex items-center justify-between bg-secondary px-4 py-2.5">
                  <span className="font-secondary text-xs font-semibold text-foreground">At-Risk Customers Requiring Action</span>
                  <span className="font-secondary text-[11px] font-medium text-primary cursor-pointer">View All</span>
                </div>
                <div className="flex items-center bg-card px-4 py-2 border-b border-border">
                  {['Customer','Segment','CLV','Idle Days','Risk','Actions'].map((h) => (
                    <span key={h} className="font-primary text-[10px] font-semibold text-muted-foreground flex-1">{h}</span>
                  ))}
                </div>
                {atRiskRows.map((r, i) => (
                  <div key={r.name} className={`flex items-center px-4 py-2.5 border-b border-border ${i % 2 === 1 ? 'bg-secondary' : 'bg-card'}`}>
                    <span className="font-secondary text-xs font-medium text-foreground flex-1">{r.name}</span>
                    <span className="font-secondary text-xs text-foreground flex-1">{r.segment}</span>
                    <span className="font-primary text-xs font-semibold text-foreground flex-1">{r.clv}</span>
                    <span className="font-primary text-xs text-foreground flex-1">{r.idle} days</span>
                    <span className="flex-1"><span className="font-primary text-[9px] font-bold text-white rounded px-1.5 py-0.5" style={{ background: r.riskBg }}>{r.risk}</span></span>
                    <span className="font-secondary text-[11px] font-medium text-primary flex-1 cursor-pointer">Contact</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
    </div>
  );
}
