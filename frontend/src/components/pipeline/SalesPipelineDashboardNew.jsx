/**
 * SalesPipelineDashboardNew.jsx
 * Screen 7 — Sales Pipeline Dashboard (Pencil frame ELRpY)
 * QuotifySidebar + summary stats, Kanban board with 4 columns
 */

// removed — MainLayout provides sidebar

const summaryStats = [
  { icon: 'account_balance_wallet', label: 'Total Pipeline', value: '$2.4M', sub: '142 quotes' },
  { icon: 'calendar_month', label: 'Closing This Month', value: '$845K', sub: '23 quotes' },
  { icon: 'warning', label: 'At Risk', value: '$120K', sub: '8 quotes', iconColor: '#D97706', valueColor: '#D97706' },
  { icon: 'schedule', label: 'Overdue Follow-up', value: '12', sub: 'quotes', iconColor: '#EF4444', valueColor: '#EF4444' },
];

const kanbanColumns = [
  {
    title: 'Qualification', count: 38, borderColor: 'hsl(var(--lu-primary))', countBg: 'hsl(var(--lu-primary))',
    cards: [
      { name: 'Parkview Residences', amount: '$24,500', rep: 'JA', repName: 'John A.', time: '3d ago' },
      { name: 'Metro Office Fit-out', amount: '$18,200', rep: 'SC', repName: 'Sarah C.', time: '5d ago' },
    ],
  },
  {
    title: 'Proposal', count: 42, borderColor: '#F59E0B', countBg: '#F59E0B',
    cards: [
      { name: 'Lakeside Villa Project', amount: '$45,800', rep: 'MS', repName: 'Mike S.', time: '1d ago', hot: true },
      { name: 'Downtown Loft Reno', amount: '$32,100', rep: 'JD', repName: 'Jane D.', time: '2d ago' },
    ],
  },
  {
    title: 'Negotiation', count: 31, borderColor: '#3B82F6', countBg: '#3B82F6',
    cards: [
      { name: 'Harbor View Condo', amount: '$67,200', rep: 'DP', repName: 'David P.', time: 'today' },
      { name: 'Sunset Heights', amount: '$28,900', rep: 'LT', repName: 'Lisa T.', time: '4d ago' },
    ],
  },
  {
    title: 'Closed Won', count: 22, borderColor: '#22C55E', countBg: '#22C55E',
    cards: [
      { name: 'Riverside Complex', amount: '$52,400', rep: 'JD', repName: 'Jane D.', time: 'Won Feb 27', won: true },
      { name: 'Oak Plaza Offices', amount: '$38,600', rep: 'MS', repName: 'Mike S.', time: 'Won Feb 25', won: true },
    ],
  },
];

export default function SalesPipelineDashboardNew() {
  return (
    <div className="flex flex-col gap-6 p-7 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="font-secondary text-[22px] font-bold text-foreground">Sales Pipeline</h1>
              <p className="font-secondary text-[13px] text-muted-foreground">Track and manage your active deals</p>
            </div>
            <button className="bg-primary text-primary-foreground font-primary text-xs font-medium px-4 py-2 rounded-full flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">add</span>New Deal
            </button>
          </div>

          {/* Summary Row */}
          <div className="grid grid-cols-4 gap-4">
            {summaryStats.map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-rounded text-base" style={{ color: s.iconColor || 'hsl(var(--lu-primary))' }}>{s.icon}</span>
                  <span className="font-secondary text-xs font-medium text-muted-foreground">{s.label}</span>
                </div>
                <span className="font-primary text-[28px] font-bold" style={{ color: s.valueColor || 'hsl(var(--lu-foreground))' }}>{s.value}</span>
                <span className="font-secondary text-[11px] text-muted-foreground">{s.sub}</span>
              </div>
            ))}
          </div>

          {/* Kanban Board */}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {kanbanColumns.map((col) => (
              <div key={col.title} className="w-[280px] shrink-0 flex flex-col gap-3">
                {/* Column Header */}
                <div className="bg-card border border-border rounded-xl p-4 border-t-4" style={{ borderTopColor: col.borderColor }}>
                  <div className="flex items-center justify-between">
                    <span className="font-secondary text-sm font-semibold text-foreground">{col.title}</span>
                    <span className="font-primary text-[11px] font-bold text-white rounded-full w-6 h-6 flex items-center justify-center" style={{ background: col.countBg }}>{col.count}</span>
                  </div>
                </div>

                {/* Deal Cards */}
                {col.cards.map((card) => (
                  <div key={card.name} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3"
                    style={card.won ? { background: '#22C55E08', borderColor: '#22C55E30' } : undefined}>
                    <div className="flex items-start justify-between">
                      <span className="font-secondary text-[13px] font-semibold text-foreground">{card.name}</span>
                      {card.hot && (
                        <span className="font-primary text-[9px] font-bold text-white rounded px-1.5 py-0.5" style={{ background: '#EF4444' }}>HOT</span>
                      )}
                    </div>
                    <span className="font-primary text-lg font-bold text-foreground">{card.amount}</span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
                          <span className="font-primary text-[9px] font-semibold text-foreground">{card.rep}</span>
                        </div>
                        <span className="font-secondary text-[11px] text-muted-foreground">{card.repName}</span>
                      </div>
                      <span className="font-secondary text-[10px] text-muted-foreground">{card.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
    </div>
  );
}
