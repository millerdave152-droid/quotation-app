/**
 * CategoryInsightsNew.jsx
 * Screen 14 — Category Insights (Pencil frame OtGp7)
 * BreadcrumbTopBar + KPIs, category distribution bars,
 * category performance table
 */

import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const kpis = [
  { label: 'Top Category', value: 'Electronics', valueSize: 18, detail: '$98,420 GMV', detailColor: 'hsl(var(--lu-primary))' },
  { label: 'Total Products', value: '4,832', valueSize: 24, detail: '+284 new this month', detailColor: '#22C55E' },
  { label: 'Avg Category Margin', value: '34.7%', valueSize: 24, detail: '+2.1% vs last month', detailColor: '#22C55E' },
  { label: 'Fastest Growing', value: 'Smart Home', valueSize: 18, detail: '+42.8% growth', detailColor: '#22C55E' },
];

const distBars = [
  { color: 'hsl(var(--lu-primary))', category: 'Electronics', revenue: '$98,420', pct: '34.6%', pctColor: 'hsl(var(--lu-primary))', w: '100%' },
  { color: '#3B82F6', category: 'Fashion', revenue: '$67,280', pct: '23.6%', pctColor: '#3B82F6', w: '68%' },
  { color: '#22C55E', category: 'Home & Garden', revenue: '$45,680', pct: '16.1%', pctColor: '#22C55E', w: '46%' },
  { color: '#8B5CF6', category: 'Smart Home', revenue: '$38,920', pct: '13.7%', pctColor: '#8B5CF6', w: '40%' },
  { color: '#F59E0B', category: 'Sports & Outdoors', revenue: '$34,230', pct: '12.0%', pctColor: '#F59E0B', w: '35%' },
];

const perfRows = [
  { category: 'Electronics', products: '1,245', orders: '3,102', rating: '4.6', growth: '+18.2%', growthColor: '#22C55E' },
  { category: 'Fashion', products: '982', orders: '2,341', rating: '4.4', growth: '+12.5%', growthColor: '#22C55E' },
  { category: 'Home & Garden', products: '876', orders: '1,567', rating: '4.3', growth: '+8.7%', growthColor: '#22C55E' },
  { category: 'Smart Home', products: '654', orders: '1,234', rating: '4.7', growth: '+42.8%', growthColor: '#22C55E' },
  { category: 'Sports & Outdoors', products: '1,075', orders: '890', rating: '4.2', growth: '-2.1%', growthColor: '#EF4444' },
];

export default function CategoryInsightsNew() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Marketplace', 'Category Insights']}
        rightContent={
          <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
            <span className="material-symbols-rounded text-sm">download</span>Export
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <span className="font-secondary text-xl font-bold text-foreground">Category Insights</span>
          <span className="font-secondary text-[11px] font-medium text-muted-foreground bg-secondary rounded-full px-3 py-1">24 categories tracked</span>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1.5">
              <span className="font-secondary text-[11px] text-muted-foreground">{k.label}</span>
              <span className="font-primary font-bold text-foreground" style={{ fontSize: k.valueSize }}>{k.value}</span>
              <span className="font-secondary text-[11px] font-semibold" style={{ color: k.detailColor }}>{k.detail}</span>
            </div>
          ))}
        </div>

        {/* Mid Row */}
        <div className="flex gap-4">
          {/* Category Distribution */}
          <div className="w-[420px] shrink-0 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-secondary text-sm font-semibold text-foreground">Category Distribution</span>
              <span className="font-secondary text-[11px] text-muted-foreground">Revenue share by category</span>
            </div>
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {distBars.map((d) => (
                <div key={d.category} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="font-secondary text-xs text-foreground">{d.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-secondary text-xs text-muted-foreground">{d.revenue}</span>
                      <span className="font-primary text-xs font-semibold" style={{ color: d.pctColor }}>{d.pct}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div className="h-1.5 rounded-full" style={{ width: d.w, background: d.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category Performance Table */}
          <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-border">
              <span className="font-secondary text-sm font-semibold text-foreground">Category Performance</span>
            </div>
            <div className="flex items-center bg-secondary px-5 py-2.5">
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Category</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Products</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 60 }}>Orders</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Avg Rating</span>
              <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Growth</span>
            </div>
            {perfRows.map((r, i) => (
              <div key={r.category} className={`flex items-center px-5 py-3 ${i < perfRows.length - 1 ? 'border-b border-border' : ''}`}>
                <span className="font-secondary text-xs font-semibold text-foreground flex-1">{r.category}</span>
                <span className="font-primary text-xs text-foreground text-right" style={{ width: 70 }}>{r.products}</span>
                <span className="font-primary text-xs text-foreground text-right" style={{ width: 60 }}>{r.orders}</span>
                <span className="font-primary text-xs font-semibold text-right" style={{ width: 70, color: '#F59E0B' }}>{r.rating}</span>
                <span className="font-primary text-xs font-semibold text-right" style={{ width: 70, color: r.growthColor }}>{r.growth}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
