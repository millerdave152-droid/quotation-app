/**
 * ProductComparisonNew.jsx
 * Screen 25 — Product Comparison (Pencil frame 6RC6o)
 * Fixed overlay, centered 720px card, comparison table
 */

const products = [
  { name: 'Ashley 3-Piece Sectional', msrp: '$2,499', cost: '$1,245', margin: '50.2%', category: 'Living Room', stock: 24 },
  { name: 'La-Z-Boy Power Recliner', msrp: '$1,599', cost: '$890', margin: '44.3%', category: 'Living Room', stock: 8 },
  { name: 'Simmons Queen Platform Bed', msrp: '$899', cost: '$520', margin: '42.2%', category: 'Bedroom', stock: 18 },
];

const rows = [
  { label: 'Product', key: 'name', isProduct: true },
  { label: 'MSRP', key: 'msrp', bold: true },
  { label: 'Cost', key: 'cost', muted: true },
  { label: 'Margin', key: 'margin', green: true },
  { label: 'Category', key: 'category' },
  { label: 'Stock', key: 'stock', isStock: true },
];

export default function ProductComparisonNew() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-[720px] bg-card rounded-xl border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-xl text-primary">compare</span>
            <span className="font-primary text-base font-bold text-foreground">Product Comparison</span>
            <span className="font-primary text-[10px] font-semibold text-white bg-primary rounded-full px-2 py-0.5">3 products</span>
          </div>
          <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center">
            <span className="material-symbols-rounded text-lg text-muted-foreground">close</span>
          </button>
        </div>

        {/* Comparison Table */}
        <div className="flex flex-col">
          {rows.map((row, ri) => (
            <div key={row.label} className={`flex ${ri < rows.length - 1 ? 'border-b border-border' : ''}`}>
              {/* Label Cell */}
              <div className="w-[120px] shrink-0 bg-secondary flex items-center px-3 py-2.5">
                <span className="font-secondary text-[11px] font-semibold text-muted-foreground">{row.label}</span>
              </div>
              {/* Product Cells */}
              {products.map((p, pi) => (
                <div key={pi} className={`flex-1 px-3 py-2.5 ${pi > 0 ? 'border-l border-border' : 'border-l border-border'}`}>
                  {row.isProduct ? (
                    <div className="flex flex-col gap-2">
                      <span className="font-secondary text-xs font-semibold text-foreground">{p.name}</span>
                      <div className="w-[60px] h-[60px] rounded-lg bg-secondary" />
                    </div>
                  ) : row.isStock ? (
                    <span className="font-primary text-xs font-semibold" style={{ color: p.stock > 10 ? '#22C55E' : '#F59E0B' }}>{p.stock}</span>
                  ) : (
                    <span className={`font-primary text-xs ${row.bold ? 'font-bold text-foreground' : ''} ${row.muted ? 'text-muted-foreground' : ''} ${row.green ? 'font-bold' : ''}`}
                      style={row.green ? { color: '#22C55E' } : undefined}>
                      {p[row.key]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
