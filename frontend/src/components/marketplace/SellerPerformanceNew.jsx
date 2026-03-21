/**
 * SellerPerformanceNew.jsx
 * Screen 30 — Seller Performance (Pencil frame tlid5)
 * BreadcrumbTopBar + header, seller data table
 */

import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const sellers = [
  { initials: 'TE', name: 'TechElite Store', color: 'hsl(var(--lu-primary))', rating: 4.9, gmv: '$42,350', orders: '892', fulfillment: 98.2, returns: 1.2, status: 'Top Seller', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { initials: 'GG', name: 'GadgetGuru', color: '#3B82F6', rating: 4.8, gmv: '$38,720', orders: '756', fulfillment: 96.5, returns: 2.1, status: 'Top Seller', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { initials: 'DH', name: 'Digital Haven', color: '#8B5CF6', rating: 4.7, gmv: '$31,450', orders: '634', fulfillment: 95.1, returns: 2.8, status: 'Active', statusColor: '#3B82F6', statusBg: '#3B82F615' },
  { initials: 'SM', name: 'SmartMart', color: '#EF4444', rating: 4.5, gmv: '$28,190', orders: '521', fulfillment: 93.8, returns: 3.5, status: 'Warning', statusColor: '#F59E0B', statusBg: '#F59E0B15' },
  { initials: 'NW', name: 'NextWave Electronics', color: '#06B6D4', rating: 4.3, gmv: '$22,810', orders: '478', fulfillment: 91.4, returns: 4.2, status: 'Active', statusColor: '#3B82F6', statusBg: '#3B82F615' },
];

export default function SellerPerformanceNew() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Marketplace', 'Seller Performance']}
        rightContent={
          <div className="flex items-center gap-3">
            <div className="h-8 w-[200px] rounded-lg border border-border bg-background px-3 flex items-center gap-2">
              <span className="material-symbols-rounded text-sm text-muted-foreground">search</span>
              <span className="font-secondary text-xs text-muted-foreground">Search sellers...</span>
            </div>
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">download</span>Export
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="font-primary text-xl font-bold text-foreground">Seller Performance</h1>
          <span className="font-secondary text-[11px] font-medium text-muted-foreground bg-secondary rounded-full px-3 py-1">1,247 active sellers</span>
        </div>

        {/* Data Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center bg-secondary px-5 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground flex-1">Seller</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center" style={{ width: 70 }}>Rating</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 90 }}>GMV</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Orders</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Fulfillment</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Returns</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>Status</span>
          </div>
          {sellers.map((s, i) => (
            <div key={s.initials} className={`flex items-center px-5 py-3 ${i < sellers.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="flex items-center gap-2 flex-1">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: s.color }}>
                  <span className="font-primary text-[10px] font-semibold text-white">{s.initials}</span>
                </div>
                <span className="font-secondary text-xs font-semibold text-foreground">{s.name}</span>
              </div>
              <div className="flex items-center justify-center gap-1" style={{ width: 70 }}>
                <span className="material-symbols-rounded text-xs" style={{ color: '#F59E0B' }}>star</span>
                <span className="font-primary text-xs text-foreground">{s.rating}</span>
              </div>
              <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 90 }}>{s.gmv}</span>
              <span className="font-primary text-xs text-foreground text-right" style={{ width: 70 }}>{s.orders}</span>
              <span className="font-primary text-xs font-semibold text-right" style={{ width: 80, color: s.fulfillment >= 95 ? '#22C55E' : '#F59E0B' }}>{s.fulfillment}%</span>
              <span className="font-primary text-xs text-right" style={{ width: 70, color: s.returns < 2 ? '#22C55E' : s.returns >= 3 ? '#EF4444' : 'hsl(var(--lu-foreground))' }}>{s.returns}%</span>
              <div className="flex justify-end" style={{ width: 80 }}>
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: s.statusBg, color: s.statusColor }}>{s.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
