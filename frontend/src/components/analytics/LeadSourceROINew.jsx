/**
 * LeadSourceROINew.jsx
 * Screen 11 — Lead Source ROI (Pencil frame 0u8MA)
 * BreadcrumbTopBar + ROI cards, trend placeholder, cost efficiency bars,
 * detailed channel comparison table
 */

import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const roiCards = [
  { channel: 'Website', roi: '342%', roiColor: 'hsl(var(--lu-primary))', badge: 'Best ROI', badgeBg: '#22C55E15', badgeColor: '#22C55E', spend: '$4,200', revenue: '$18,560', leads: '89 leads · $47.19 CPL · 19 converts', highlight: true },
  { channel: 'Referral', roi: '285%', roiColor: '#3B82F6', spend: '$2,100', revenue: '$8,085', leads: '62 leads · $33.87 CPL · 14 converts' },
  { channel: 'Walk-in', roi: '210%', roiColor: '#22C55E', spend: '$1,800', revenue: '$5,580', leads: '45 leads · $40.00 CPL · 9 converts' },
  { channel: 'Social', roi: '82%', roiColor: '#F59E0B', badge: 'Low ROI', badgeBg: '#EF444415', badgeColor: '#EF4444', spend: '$3,500', revenue: '$6,370', leads: '28 leads · $125 CPL · 4 converts' },
];

const efficiencyBars = [
  { channel: 'Website', cpl: '$47.19 CPL', w: '85%', color: 'hsl(var(--lu-primary))', bg: '#FF840020' },
  { channel: 'Referral', cpl: '$33.87 CPL', w: '72%', color: '#3B82F6', bg: '#3B82F620' },
  { channel: 'Walk-in', cpl: '$40.00 CPL', w: '60%', color: '#22C55E', bg: '#22C55E20' },
  { channel: 'Social', cpl: '$125.00 CPL', w: '36%', color: '#EF4444', bg: '#EF444420' },
];

const legend = [
  { label: 'Website', color: 'hsl(var(--lu-primary))' },
  { label: 'Referral', color: '#3B82F6' },
  { label: 'Walk-in', color: '#22C55E' },
  { label: 'Social', color: '#EF4444' },
];

const tableRows = [
  { dot: 'hsl(var(--lu-primary))', channel: 'Website', leads: '89', spend: '$4,200', revenue: '$18,560', cpl: '$47.19', conv: '21.3%', convColor: '#22C55E', roi: '342%', roiColor: 'hsl(var(--lu-primary))', trend: 'trending_up', trendColor: '#22C55E' },
  { dot: '#3B82F6', channel: 'Referral', leads: '62', spend: '$2,100', revenue: '$8,085', cpl: '$33.87', conv: '18.5%', convColor: '#22C55E', roi: '285%', roiColor: '#3B82F6', trend: 'trending_up', trendColor: '#22C55E' },
  { dot: '#22C55E', channel: 'Walk-in', leads: '45', spend: '$1,800', revenue: '$5,580', cpl: '$40.00', conv: '15.6%', convColor: '#F59E0B', roi: '210%', roiColor: '#22C55E', trend: 'remove', trendColor: '#F59E0B' },
  { dot: '#EF4444', channel: 'Social', leads: '28', spend: '$3,500', revenue: '$6,370', cpl: '$125.00', cplColor: '#EF4444', conv: '10.7%', convColor: '#EF4444', roi: '82%', roiColor: '#EF4444', trend: 'trending_down', trendColor: '#EF4444' },
  { dot: '#8B5CF6', channel: 'Marketplace', leads: '24', spend: '$1,600', revenue: '$4,320', cpl: '$66.67', conv: '12.5%', convColor: '#F59E0B', roi: '170%', roiColor: '#8B5CF6', trend: 'trending_up', trendColor: '#22C55E' },
];

const colW = [140, 80, 100, 110, 90, 100, 80];

export default function LeadSourceROINew() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Lead Source ROI']}
        rightContent={
          <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
            <span className="material-symbols-rounded text-sm">download</span>Export
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
        {/* ROI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {roiCards.map((c) => (
            <div key={c.channel} className={`bg-card rounded-xl p-5 flex flex-col gap-2 ${c.highlight ? 'border-2 border-primary' : 'border border-border'}`}>
              <div className="flex items-center justify-between">
                <span className="font-secondary text-sm font-semibold text-foreground">{c.channel}</span>
                {c.badge && (
                  <span className="font-secondary text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: c.badgeBg, color: c.badgeColor }}>{c.badge}</span>
                )}
              </div>
              <span className="font-primary text-[32px] font-bold" style={{ color: c.roiColor }}>{c.roi}</span>
              <span className="font-secondary text-[11px] text-muted-foreground">Spend: {c.spend} · Revenue: {c.revenue}</span>
              <span className="font-secondary text-[11px] text-muted-foreground">{c.leads}</span>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="flex gap-6">
          {/* ROI Trend Placeholder */}
          <div className="flex-1 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-base font-semibold text-foreground">ROI Trend by Channel</span>
            <div className="flex-1 rounded-lg bg-gradient-to-b from-primary/10 to-transparent flex items-center justify-center" style={{ minHeight: 200 }}>
              <span className="font-secondary text-sm text-muted-foreground">ROI Trend Chart</span>
            </div>
            <div className="flex items-center gap-5">
              {legend.map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
                  <span className="font-secondary text-[11px] text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cost Efficiency */}
          <div className="w-[400px] shrink-0 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <span className="font-secondary text-base font-semibold text-foreground">Cost Efficiency</span>
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {efficiencyBars.map((b) => (
                <div key={b.channel} className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="font-secondary text-xs text-foreground">{b.channel}</span>
                    <span className="font-secondary text-xs font-semibold" style={{ color: b.color }}>{b.cpl}</span>
                  </div>
                  <div className="h-5 rounded" style={{ background: b.bg }}>
                    <div className="h-5 rounded" style={{ width: b.w, background: b.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detailed Channel Comparison Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="font-secondary text-sm font-semibold text-foreground">Detailed Channel Comparison</span>
            <span className="font-secondary text-[11px] text-muted-foreground">Last 90 Days</span>
          </div>
          <div className="flex items-center bg-secondary px-5 py-2.5">
            {['Channel', 'Leads', 'Spend', 'Revenue', 'CPL', 'Conv. Rate', 'ROI', 'Trend'].map((h, i) => (
              <span key={h} className="font-secondary text-[11px] font-semibold text-muted-foreground"
                style={{ width: i < 7 ? colW[i] : undefined, flex: i === 7 ? 1 : undefined, textAlign: i > 0 ? 'right' : 'left' }}>
                {h}
              </span>
            ))}
          </div>
          {tableRows.map((r, i) => (
            <div key={r.channel} className={`flex items-center px-5 py-3 ${i < tableRows.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="flex items-center gap-2" style={{ width: 140 }}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.dot }} />
                <span className="font-secondary text-xs font-medium text-foreground">{r.channel}</span>
              </div>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 80 }}>{r.leads}</span>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 100 }}>{r.spend}</span>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 110 }}>{r.revenue}</span>
              <span className="font-primary text-xs text-right" style={{ width: 90, color: r.cplColor || 'hsl(var(--lu-foreground))' }}>{r.cpl}</span>
              <span className="font-primary text-xs font-semibold text-right" style={{ width: 100, color: r.convColor }}>{r.conv}</span>
              <span className="font-primary text-xs font-bold text-right" style={{ width: 80, color: r.roiColor }}>{r.roi}</span>
              <div className="flex justify-end flex-1">
                <span className="material-symbols-rounded text-base" style={{ color: r.trendColor }}>{r.trend}</span>
              </div>
            </div>
          ))}
          {/* Total Row */}
          <div className="flex items-center px-5 py-3 bg-secondary">
            <div className="flex items-center gap-2" style={{ width: 140 }}>
              <span className="font-secondary text-xs font-semibold text-foreground">Total</span>
            </div>
            <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 80 }}>248</span>
            <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 100 }}>$13,200</span>
            <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 110 }}>$42,915</span>
            <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 90 }}>$53.23</span>
            <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 100 }}>16.5%</span>
            <span className="font-primary text-xs font-bold text-right" style={{ width: 80, color: 'hsl(var(--lu-primary))' }}>225%</span>
            <div className="flex justify-end flex-1">
              <span className="material-symbols-rounded text-base" style={{ color: '#22C55E' }}>trending_up</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
