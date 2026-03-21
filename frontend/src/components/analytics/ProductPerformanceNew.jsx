/**
 * ProductPerformanceNew.jsx
 * Screen 12 — Product Performance (Pencil frame SlH34)
 * BreadcrumbTopBar + KPIs, product ranking table
 */

import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const kpis = [
  { label: 'Top Seller', value: 'Premium Headphones', valueSize: 16, sub: '342 units · $51,300 revenue' },
  { label: 'Total Products Sold', value: '2,847', valueSize: 24, sub: '+18% vs last period', subColor: '#22C55E' },
  { label: 'Avg Margin', value: '42.3%', valueSize: 24, sub: '+2.1% vs last period', subColor: '#22C55E' },
  { label: 'Low Stock Items', value: '12', valueSize: 24, valueColor: '#EF4444', sub: 'Needs reorder attention', subColor: '#EF4444', borderColor: '#EF444440' },
];

const products = [
  { rank: 1, name: 'Premium Headphones', category: 'Electronics', units: '342', revenue: '$51,300', margin: '48.2%', marginColor: '#22C55E', trend: 'trending_up', trendPct: '+12%', trendColor: '#22C55E', stock: 156 },
  { rank: 2, name: 'Wireless Speaker', category: 'Electronics', units: '289', revenue: '$43,350', margin: '44.7%', marginColor: '#22C55E', trend: 'trending_up', trendPct: '+8%', trendColor: '#22C55E', stock: 234 },
  { rank: 3, name: 'Smart Watch Pro', category: 'Wearables', units: '198', revenue: '$39,600', margin: '52.1%', marginColor: '#22C55E', trend: 'trending_up', trendPct: '+22%', trendColor: '#22C55E', stock: 8 },
  { rank: 4, name: 'Laptop Stand Deluxe', category: 'Accessories', units: '176', revenue: '$14,080', margin: '38.5%', trend: 'trending_down', trendPct: '-5%', trendColor: '#EF4444', stock: 89 },
  { rank: 5, name: 'USB-C Hub 7-in-1', category: 'Accessories', units: '154', revenue: '$7,700', margin: '35.8%', trend: 'remove', trendPct: '0%', trendColor: 'hsl(var(--lu-muted-foreground))', stock: 3 },
  { rank: 6, name: 'Mechanical Keyboard', category: 'Peripherals', units: '132', revenue: '$17,160', margin: '41.3%', marginColor: '#22C55E', trend: 'trending_up', trendPct: '+15%', trendColor: '#22C55E', stock: 67 },
];

export default function ProductPerformanceNew() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['POS Reports', 'Product Performance']}
        rightContent={
          <div className="flex items-center gap-3">
            <select className="h-8 px-3 rounded-lg border border-border bg-card text-foreground font-secondary text-xs outline-none">
              <option>All Categories</option><option>Electronics</option><option>Wearables</option><option>Accessories</option><option>Peripherals</option>
            </select>
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">download</span>Export
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card rounded-xl p-4 flex flex-col gap-1"
              style={{ border: k.borderColor ? `2px solid ${k.borderColor}` : '1px solid hsl(var(--lu-border))' }}>
              <span className="font-secondary text-[11px] text-muted-foreground">{k.label}</span>
              <span className="font-primary font-bold text-foreground" style={{ fontSize: k.valueSize, color: k.valueColor }}>{k.value}</span>
              <span className="font-secondary text-[11px]" style={{ color: k.subColor || 'hsl(var(--lu-muted-foreground))' }}>{k.sub}</span>
            </div>
          ))}
        </div>

        {/* Product Performance Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="font-secondary text-sm font-semibold text-foreground">Product Performance Ranking</span>
            <span className="font-secondary text-[11px] text-muted-foreground">Last 30 days</span>
          </div>
          <div className="flex items-center bg-secondary px-5 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 30 }}>#</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Product</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 120 }}>Category</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 90 }}>Units Sold</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 100 }}>Revenue</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Margin</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Trend</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Stock</span>
          </div>
          {products.map((p, i) => (
            <div key={p.rank} className={`flex items-center px-5 py-3 ${i < products.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="font-primary text-[13px] font-bold" style={{ width: 30, color: p.rank <= 3 ? 'hsl(var(--lu-primary))' : 'hsl(var(--lu-muted-foreground))' }}>{p.rank}</span>
              <span className="font-secondary text-xs font-semibold text-foreground flex-1">{p.name}</span>
              <span className="font-secondary text-xs text-muted-foreground" style={{ width: 120 }}>{p.category}</span>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 90 }}>{p.units}</span>
              <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 100 }}>{p.revenue}</span>
              <span className="font-primary text-xs font-semibold text-right" style={{ width: 80, color: p.marginColor || 'hsl(var(--lu-foreground))' }}>{p.margin}</span>
              <div className="flex items-center justify-end gap-1" style={{ width: 80 }}>
                <span className="material-symbols-rounded text-sm" style={{ color: p.trendColor }}>{p.trend}</span>
                <span className="font-primary text-[11px] font-semibold" style={{ color: p.trendColor }}>{p.trendPct}</span>
              </div>
              <div className="flex justify-end" style={{ width: 70 }}>
                {p.stock <= 8 ? (
                  <span className="font-primary text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: '#EF444415', color: '#EF4444' }}>{p.stock} Low</span>
                ) : (
                  <span className="font-primary text-xs text-foreground">{p.stock}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
