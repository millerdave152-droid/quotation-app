/**
 * LeadAnalyticsNew.jsx
 * Screen 10 — Lead Analytics (Pencil frame kvnbi)
 * BreadcrumbTopBar + KPIs, lead sources placeholder,
 * lead status breakdown, recent leads table
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['30d', '60d', '90d'];

const kpis = [
  { label: 'Total Leads', value: '248', badge: '+18.2%', badgeBg: '#22C55E15', badgeColor: '#22C55E' },
  { label: 'Qualified Leads', value: '170', badge: '68.5% qualified', badgeBg: '#22C55E15', badgeColor: '#22C55E' },
  { label: 'Cost per Lead', value: '$42.50', badge: '-$3.20', badgeBg: '#22C55E15', badgeColor: '#22C55E' },
  { label: 'Lead → Customer', value: '19.8%', badge: '+2.1%', badgeBg: '#22C55E15', badgeColor: '#22C55E' },
];

const leadStatuses = [
  { label: 'New', count: 82, w: '100%', color: '#3B82F6' },
  { label: 'Contacted', count: 65, w: '79%', color: 'hsl(var(--lu-primary))' },
  { label: 'Qualified', count: 52, w: '63%', color: '#22C55E' },
  { label: 'Proposal', count: 31, w: '38%', color: '#F59E0B' },
  { label: 'Won', count: 18, w: '22%', color: '#10B981' },
];

const recentLeads = [
  { name: 'Robert Chen', source: 'Website', interest: 'Living Room Set', score: 85, status: 'Qualified', statusBg: '#22C55E15', statusColor: '#22C55E' },
  { name: 'Maria Santos', source: 'Referral', interest: 'Office Furniture', score: 72, status: 'Contacted', statusBg: '#FF840015', statusColor: 'hsl(var(--lu-primary))' },
  { name: 'James Wilson', source: 'Trade Show', interest: 'Dining Collection', score: 68, status: 'New', statusBg: '#3B82F615', statusColor: '#3B82F6' },
  { name: 'Amy Zhang', source: 'Social Media', interest: 'Bedroom Suite', score: 91, status: 'Proposal', statusBg: '#F59E0B15', statusColor: '#D97706' },
];

function scoreColor(score) {
  if (score >= 80) return '#22C55E';
  if (score >= 60) return '#D97706';
  return '#EF4444';
}

export default function LeadAnalyticsNew() {
  const [activePeriod, setActivePeriod] = useState('30d');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Lead Analytics']}
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
                <span className="font-secondary text-[11px] font-semibold rounded-full px-2 py-0.5 mb-1" style={{ background: k.badgeBg, color: k.badgeColor }}>{k.badge}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="flex gap-4" style={{ height: 320 }}>
          {/* Lead Sources Placeholder */}
          <div className="flex-1 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-sm font-semibold text-foreground">Lead Sources</span>
            <div className="flex-1 rounded-lg bg-gradient-to-b from-primary/10 to-transparent flex items-center justify-center">
              <span className="font-secondary text-sm text-muted-foreground">Lead Sources Chart</span>
            </div>
          </div>

          {/* Lead Status Breakdown */}
          <div className="w-[380px] shrink-0 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-sm font-semibold text-foreground">Lead Status</span>
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {leadStatuses.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="font-secondary text-xs text-foreground w-20 shrink-0">{s.label}</span>
                  <div className="flex-1 h-5 rounded bg-secondary">
                    <div className="h-5 rounded" style={{ width: s.w, background: s.color }} />
                  </div>
                  <span className="font-primary text-xs font-semibold text-foreground w-8 text-right">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Leads Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="font-secondary text-sm font-semibold text-foreground">Recent Leads</span>
            <span className="font-secondary text-[11px] font-medium text-primary cursor-pointer">View All</span>
          </div>
          <div className="flex items-center bg-secondary px-5 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Name</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 100 }}>Source</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 140 }}>Interest</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 60 }}>Score</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Status</span>
          </div>
          {recentLeads.map((r, i) => (
            <div key={r.name} className={`flex items-center px-5 py-3 ${i < recentLeads.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="font-secondary text-xs font-medium text-foreground flex-1">{r.name}</span>
              <span className="font-secondary text-xs text-foreground" style={{ width: 100 }}>{r.source}</span>
              <span className="font-secondary text-xs text-muted-foreground" style={{ width: 140 }}>{r.interest}</span>
              <span className="font-primary text-xs font-bold text-right" style={{ width: 60, color: scoreColor(r.score) }}>{r.score}</span>
              <div className="flex justify-end" style={{ width: 80 }}>
                <span className="font-secondary text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: r.statusBg, color: r.statusColor }}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
