/**
 * LeadsWidgetNew.jsx
 * Screen 15 — Leads Widget (Pencil frame hBvnU)
 * Standalone 380px card widget: stats, mini pipeline, recent leads, footer
 * Preview route renders centered on bg-background
 */

const stats = [
  { label: 'New', value: '28', change: '+12%', changeColor: '#22C55E' },
  { label: 'Qualified', value: '32', change: '+8%', changeColor: '#22C55E' },
  { label: 'Hot', value: '12', valueColor: 'hsl(var(--lu-primary))', icon: 'local_fire_department', iconColor: 'hsl(var(--lu-primary))' },
];

const pipelineSegments = [
  { color: '#3B82F6', width: 90, radius: '4px 0 0 4px' },
  { color: 'hsl(var(--lu-primary))', width: 70, radius: '0' },
  { color: '#F59E0B', width: 50, radius: '0' },
  { color: '#22C55E', width: 30, radius: '0' },
];

const pipelineLegend = [
  { label: 'New 28', color: '#3B82F6' },
  { label: 'Contacted 45', color: 'hsl(var(--lu-primary))' },
  { label: 'Qualified 32', color: '#F59E0B' },
];

const recentLeads = [
  { name: 'Sarah Mitchell', sub: 'Walk-in · 2 hrs ago', badge: 'HOT', badgeColor: 'hsl(var(--lu-primary))', badgeBg: '#FFF0E0' },
  { name: 'James Rodriguez', sub: 'Phone · 5 hrs ago', badge: 'NEW', badgeColor: '#3B82F6', badgeBg: '#EFF6FF' },
  { name: 'David Chen', sub: 'Website · Yesterday', badge: 'WARM', badgeColor: 'hsl(var(--lu-muted-foreground))', badgeBg: 'hsl(var(--lu-secondary))' },
];

export default function LeadsWidgetNew() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-[380px] bg-card border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <span className="material-symbols-rounded text-xl text-primary">group</span>
          <span className="font-secondary text-[15px] font-semibold text-foreground flex-1">Leads</span>
          <span className="font-primary text-[11px] font-semibold text-white bg-primary rounded-full px-2 py-0.5">142</span>
          <span className="font-secondary text-xs font-medium text-primary cursor-pointer ml-2">View All →</span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 p-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-background rounded-lg p-3 flex flex-col gap-1">
              <span className="font-secondary text-[10px] text-muted-foreground">{s.label}</span>
              <span className="font-primary text-[22px] font-bold" style={{ color: s.valueColor || 'hsl(var(--lu-foreground))' }}>{s.value}</span>
              {s.change && <span className="font-secondary text-[10px] font-semibold" style={{ color: s.changeColor }}>{s.change}</span>}
              {s.icon && <span className="material-symbols-rounded text-sm" style={{ color: s.iconColor }}>{s.icon}</span>}
            </div>
          ))}
        </div>

        {/* Mini Pipeline */}
        <div className="px-5 py-3 border-t border-b border-border">
          <span className="font-secondary text-xs font-semibold text-foreground">Pipeline</span>
          <div className="flex mt-2 gap-0.5" style={{ height: 8 }}>
            {pipelineSegments.map((seg, i) => (
              <div key={i} style={{ width: seg.width, background: seg.color, borderRadius: seg.radius }} />
            ))}
            <div className="flex-1 bg-secondary" style={{ borderRadius: '0 4px 4px 0' }} />
          </div>
          <div className="flex items-center gap-3 mt-2">
            {pipelineLegend.map((l) => (
              <div key={l.label} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                <span className="font-secondary text-[10px] text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Leads */}
        <div className="px-5 py-3 flex flex-col gap-2.5">
          {recentLeads.map((l) => (
            <div key={l.name} className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-secondary text-xs font-medium text-foreground">{l.name}</span>
                <span className="font-secondary text-[10px] text-muted-foreground">{l.sub}</span>
              </div>
              <span className="font-primary text-[9px] font-bold rounded px-1.5 py-0.5" style={{ background: l.badgeBg, color: l.badgeColor }}>{l.badge}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex flex-col gap-2.5">
          {/* Alert Banner */}
          <div className="flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer" style={{ background: '#FFF8F0' }}>
            <span className="material-symbols-rounded text-sm text-primary">notifications</span>
            <span className="font-secondary text-[11px] font-medium text-primary flex-1">8 follow-ups due today</span>
            <span className="material-symbols-rounded text-sm text-primary">chevron_right</span>
          </div>
          {/* Button Row */}
          <div className="flex gap-2">
            <button className="flex-1 h-8 bg-primary text-primary-foreground rounded-full font-primary text-[11px] font-medium flex items-center justify-center gap-1">
              <span className="material-symbols-rounded text-sm">add</span>Quick Capture
            </button>
            <button className="flex-1 h-8 border border-border text-foreground rounded-full font-primary text-[11px] font-medium flex items-center justify-center gap-1">
              <span className="material-symbols-rounded text-sm">bar_chart</span>Analytics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
