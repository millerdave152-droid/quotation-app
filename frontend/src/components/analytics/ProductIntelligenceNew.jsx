/**
 * ProductIntelligenceNew.jsx
 * Screen 23 — Product Intelligence (Pencil frame MLitj)
 * QuotifySidebar + header, 5 stats, price distribution bars,
 * inventory status, recent product quotes table
 */

// removed — MainLayout provides sidebar

const statsData = [
  { label: 'Catalog Size', value: '2,847', detail: '+124 this month', detailColor: '#22C55E' },
  { label: 'Avg. MSRP', value: '$1,842', detail: '+2.3% vs last month', detailColor: '#22C55E' },
  { label: 'Avg. Margin', value: '38.6%', valueColor: '#22C55E', detail: 'Target: 35%' },
  { label: 'Quote Conversion', value: '62.4%', detail: '+4.1% vs last quarter', detailColor: '#22C55E' },
  { label: 'Stock Turnover', value: '4.2x', detail: 'Industry avg: 3.8x' },
];

const priceBars = [
  { category: 'Living Room', value: '$2,140', w: '100%', color: 'hsl(var(--lu-primary))' },
  { category: 'Bedroom', value: '$1,680', w: '78%', color: '#8B5CF6' },
  { category: 'Dining', value: '$1,320', w: '62%', color: '#3B82F6' },
  { category: 'Office', value: '$980', w: '46%', color: '#F59E0B' },
  { category: 'Outdoor', value: '$720', w: '34%', color: '#22C55E' },
];

const inventoryStatus = [
  { status: 'In Stock', count: '2,184', pct: '76.7%', color: '#22C55E' },
  { status: 'Low Stock', count: '342', pct: '12.0%', color: '#F59E0B' },
  { status: 'Out of Stock', count: '187', pct: '6.6%', color: '#EF4444' },
  { status: 'Reserved', count: '134', pct: '4.7%', color: '#6366F1' },
];

const quoteRows = [
  { id: 'Q-2026-0847', customer: 'John Anderson', products: '4', total: '$8,240', topProduct: 'Ashley 3-Piece Sectional', status: 'Pending', statusColor: '#F59E0B', statusBg: '#F59E0B15' },
  { id: 'Q-2026-0843', customer: 'Martinez Properties', products: '7', total: '$14,680', topProduct: 'La-Z-Boy Power Recliner (x3)', status: 'Accepted', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { id: 'Q-2026-0839', customer: 'Emily Watson', products: '2', total: '$3,498', topProduct: 'Simmons Queen Platform Bed', status: 'Sent', statusColor: '#3B82F6', statusBg: '#3B82F615' },
];

export default function ProductIntelligenceNew() {
  return (
    <div className="p-7 flex flex-col gap-5 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-primary text-[22px] font-bold text-foreground">Product Intelligence</h1>
            <p className="font-secondary text-[13px] text-muted-foreground">Analytics, price trends, inventory insights & quote performance</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">download</span>Export Report
            </button>
            <button className="h-8 px-4 rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">refresh</span>Refresh Data
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-5 gap-3">
          {statsData.map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
              <span className="font-secondary text-[10px] text-muted-foreground">{s.label}</span>
              <span className="font-primary text-lg font-bold" style={{ color: s.valueColor || 'hsl(var(--lu-foreground))' }}>{s.value}</span>
              <span className="font-secondary text-[10px]" style={{ color: s.detailColor || 'hsl(var(--lu-muted-foreground))' }}>{s.detail}</span>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Price Distribution */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <span className="material-symbols-rounded text-lg text-primary">bar_chart</span>
              <span className="font-secondary text-sm font-semibold text-foreground">Price Distribution</span>
            </div>
            <div className="p-5 flex flex-col gap-3">
              {priceBars.map((b) => (
                <div key={b.category} className="flex items-center gap-2">
                  <span className="font-secondary text-xs text-foreground w-20 shrink-0">{b.category}</span>
                  <div className="flex-1 h-4 rounded bg-secondary">
                    <div className="h-4 rounded" style={{ width: b.w, background: b.color }} />
                  </div>
                  <span className="font-primary text-xs font-semibold text-foreground w-12 text-right">{b.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Status */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <span className="material-symbols-rounded text-lg text-primary">inventory_2</span>
              <span className="font-secondary text-sm font-semibold text-foreground">Inventory Status</span>
            </div>
            <div className="p-5 flex flex-col gap-3">
              {inventoryStatus.map((s) => (
                <div key={s.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="font-secondary text-xs text-foreground">{s.status}</span>
                  </div>
                  <span className="font-primary text-xs text-foreground">{s.count} ({s.pct})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Product Quotes Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-lg text-primary">receipt_long</span>
              <span className="font-secondary text-sm font-semibold text-foreground">Recent Product Quotes</span>
            </div>
            <span className="font-primary text-[10px] font-semibold text-white bg-primary rounded-full px-2 py-0.5">Last 7 days</span>
          </div>
          <div className="flex items-center bg-secondary px-5 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 120 }}>Quote #</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 150 }}>Customer</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center" style={{ width: 60 }}>Products</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 100 }}>Total Value</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1 pl-4">Top Product</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Status</span>
          </div>
          {quoteRows.map((r, i) => (
            <div key={r.id} className={`flex items-center px-5 py-3 ${i < quoteRows.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="font-primary text-xs font-semibold text-primary" style={{ width: 120 }}>{r.id}</span>
              <span className="font-secondary text-xs text-foreground" style={{ width: 150 }}>{r.customer}</span>
              <span className="font-primary text-xs text-foreground text-center" style={{ width: 60 }}>{r.products}</span>
              <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 100 }}>{r.total}</span>
              <span className="font-secondary text-xs text-muted-foreground flex-1 pl-4">{r.topProduct}</span>
              <div className="flex justify-end" style={{ width: 80 }}>
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: r.statusBg, color: r.statusColor }}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
    </div>
  );
}
