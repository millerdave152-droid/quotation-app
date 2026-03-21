/**
 * SalesLeaderboardNew.jsx
 * Screen 8 — Sales Leaderboard (Pencil frame qxKbl)
 * BreadcrumbTopBar + podium (top 3), full rankings table
 */

import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['Week', 'Month', 'Quarter'];

const podium = [
  { place: 2, name: 'Mike Smith', initials: 'MS', revenue: '$285,400', deals: '31 deals', quota: 92, icon: 'star', iconColor: '#94A3B8' },
  { place: 1, name: 'Jane Doe', initials: 'JD', revenue: '$412,800', deals: '42 deals', quota: 118, icon: 'workspace_premium', iconColor: '#F59E0B', highlight: true },
  { place: 3, name: 'Sarah Chen', initials: 'SC', revenue: '$195,200', deals: '28 deals', quota: 78, icon: 'star', iconColor: '#CD7F32' },
];

const rankings = [
  { rank: 1, name: 'Jane Doe', initials: 'JD', revenue: '$412,800', deals: 42, winRate: '38.5%', quota: 118, quotaColor: '#22C55E', TrendIcon: TrendingUp, trendColor: '#22C55E' },
  { rank: 2, name: 'Mike Smith', initials: 'MS', revenue: '$285,400', deals: 31, winRate: '32.1%', quota: 92, quotaColor: '#22C55E', TrendIcon: TrendingUp, trendColor: '#22C55E' },
  { rank: 3, name: 'Sarah Chen', initials: 'SC', revenue: '$195,200', deals: 28, winRate: '35.0%', quota: 78, quotaColor: '#D97706', TrendIcon: Minus, trendColor: '#D97706' },
  { rank: 4, name: 'David Park', initials: 'DP', revenue: '$155,600', deals: 22, winRate: '28.2%', quota: 62, quotaColor: '#EF4444', TrendIcon: TrendingDown, trendColor: '#EF4444' },
  { rank: 5, name: 'Lisa Thompson', initials: 'LT', revenue: '$128,900', deals: 19, winRate: '30.6%', quota: 71, quotaColor: '#D97706', TrendIcon: TrendingUp, trendColor: '#22C55E' },
];

export default function SalesLeaderboardNew() {
  const [activePeriod, setActivePeriod] = useState('Month');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Sales Leaderboard']}
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
        {/* Podium Row — order: #2 | #1 | #3 */}
        <div className="flex items-end justify-center gap-6">
          {podium.map((p) => (
            <div key={p.place}
              className="w-[240px] rounded-xl p-6 flex flex-col items-center gap-3 border border-border"
              style={p.highlight
                ? { background: 'linear-gradient(135deg, hsl(var(--lu-primary)), hsl(var(--lu-primary) / 0.8))', paddingTop: 40 }
                : { background: 'hsl(var(--lu-card))' }
              }>
              <span className="material-symbols-rounded text-2xl" style={{ color: p.highlight ? '#FFF' : p.iconColor }}>{p.icon}</span>
              <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
                style={{ background: p.highlight ? 'rgba(255,255,255,0.2)' : 'hsl(var(--lu-secondary))' }}>
                <span className={`font-primary text-base font-bold ${p.highlight ? 'text-white' : 'text-foreground'}`}>{p.initials}</span>
              </div>
              <span className={`font-secondary text-sm font-bold ${p.highlight ? 'text-white' : 'text-foreground'}`}>{p.name}</span>
              <span className={`font-primary text-2xl font-bold ${p.highlight ? 'text-white' : 'text-foreground'}`}>{p.revenue}</span>
              <span className={`font-secondary text-[11px] ${p.highlight ? 'text-white/80' : 'text-muted-foreground'}`}>{p.deals}</span>
              {/* Quota Bar */}
              <div className="w-full flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className={`font-secondary text-[10px] ${p.highlight ? 'text-white/70' : 'text-muted-foreground'}`}>Quota</span>
                  <span className={`font-primary text-[11px] font-bold ${p.highlight ? 'text-white' : ''}`}
                    style={!p.highlight ? { color: p.quota >= 100 ? '#22C55E' : p.quota >= 70 ? '#D97706' : '#EF4444' } : undefined}>
                    {p.quota}%
                  </span>
                </div>
                <div className="h-2 rounded-full" style={{ background: p.highlight ? 'rgba(255,255,255,0.2)' : 'hsl(var(--lu-secondary))' }}>
                  <div className="h-2 rounded-full" style={{
                    width: `${Math.min(p.quota, 100)}%`,
                    background: p.highlight ? '#FFF' : (p.quota >= 100 ? '#22C55E' : p.quota >= 70 ? '#D97706' : '#EF4444')
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Full Rankings Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="font-secondary text-sm font-semibold text-foreground">Full Rankings</span>
          </div>
          <div className="flex items-center bg-secondary px-5 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 30 }}>#</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Rep</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 90 }}>Revenue</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 60 }}>Deals</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Win Rate</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 60 }}>Quota</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 50 }}>Trend</span>
          </div>
          {rankings.map((r, i) => (
            <div key={r.rank} className={`flex items-center px-5 py-3 ${i < rankings.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="font-primary text-[13px] font-bold text-primary" style={{ width: 30 }}>{r.rank}</span>
              <div className="flex items-center gap-2 flex-1">
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <span className="font-primary text-[10px] font-semibold text-foreground">{r.initials}</span>
                </div>
                <span className="font-secondary text-xs font-medium text-foreground">{r.name}</span>
              </div>
              <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 90 }}>{r.revenue}</span>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 60 }}>{r.deals}</span>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 70 }}>{r.winRate}</span>
              <span className="font-primary text-xs font-bold text-right" style={{ width: 60, color: r.quotaColor }}>{r.quota}%</span>
              <div className="flex justify-end" style={{ width: 50 }}>
                <r.TrendIcon size={16} color={r.trendColor} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
