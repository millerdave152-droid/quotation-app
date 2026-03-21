/**
 * CEProductImportNew.jsx
 * Screen 27 — CE Product Import / Icecat (Pencil frame ZoJAa)
 * QuotifySidebar + header, UPC entry + CSV upload cards,
 * recent import results table
 */

// removed — MainLayout provides sidebar

const importRows = [
  { upc: '012345678901', name: 'Samsung 65" QLED 4K Smart TV', brand: 'Samsung', msrp: '$1,499' },
  { upc: '012345678902', name: 'LG OLED 55" C3 Series', brand: 'LG Electronics', msrp: '$1,299' },
  { upc: '012345678903', name: 'Sony WH-1000XM5 Headphones', brand: 'Sony', msrp: '$399' },
  { upc: '012345678904', name: 'Apple MacBook Air M3 15"', brand: 'Apple', msrp: '$1,299' },
];

export default function CEProductImportNew() {
  return (
    <div className="p-7 flex flex-col gap-5 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-primary text-[22px] font-bold text-foreground">CE Product Import (Icecat)</h1>
            <p className="font-secondary text-[13px] text-muted-foreground">Import product data from Icecat via UPC codes or CSV upload</p>
          </div>
          <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
            <span className="material-symbols-rounded text-sm">history</span>Import History
          </button>
        </div>

        {/* Two-Column Card Row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Enter UPC Codes */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <span className="material-symbols-rounded text-lg text-primary">barcode</span>
              <span className="font-secondary text-[15px] font-semibold text-foreground">Enter UPC Codes</span>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <span className="font-secondary text-[11px] text-muted-foreground">Enter one UPC code per line or separate with commas</span>
              <textarea
                className="w-full h-[160px] rounded-lg bg-background border border-border p-3 font-mono text-xs text-foreground resize-none leading-relaxed"
                defaultValue={"012345678901\n012345678902\n012345678903\n012345678904"}
              />
              <button className="h-9 w-full rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium flex items-center justify-center gap-1.5">
                <span className="material-symbols-rounded text-sm">cloud_download</span>Import 4 Products
              </button>
            </div>
          </div>

          {/* CSV Upload */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <span className="material-symbols-rounded text-lg text-primary">upload_file</span>
              <span className="font-secondary text-[15px] font-semibold text-foreground">CSV Upload</span>
            </div>
            <div className="p-5 flex flex-col gap-3 items-center">
              <div className="w-full h-[160px] rounded-lg bg-background border-2 border-dashed border-border hover:border-primary transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer">
                <span className="material-symbols-rounded text-4xl text-muted-foreground">cloud_upload</span>
                <span className="font-secondary text-xs text-foreground">Drop CSV file here or click to browse</span>
                <span className="font-secondary text-[10px] text-muted-foreground">Supports .csv and .xlsx up to 10MB</span>
              </div>
              <button className="h-8 px-4 text-muted-foreground font-secondary text-xs font-medium flex items-center gap-1.5 hover:text-foreground transition-colors">
                <span className="material-symbols-rounded text-sm">download</span>Download Template CSV
              </button>
            </div>
          </div>
        </div>

        {/* Recent Import Results Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-lg" style={{ color: '#22C55E' }}>task_alt</span>
              <span className="font-secondary text-[15px] font-semibold text-foreground">Recent Import Results</span>
              <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: '#22C55E15', color: '#22C55E' }}>4 of 4 successful</span>
            </div>
          </div>
          <div className="flex items-center bg-secondary px-4 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 130 }}>UPC</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 220 }}>Product Name</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 120 }}>Brand</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right" style={{ width: 80 }}>MSRP</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center flex-1">Status</span>
          </div>
          {importRows.map((r, i) => (
            <div key={r.upc} className={`flex items-center px-4 py-3 ${i < importRows.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="font-mono text-xs text-foreground" style={{ width: 130 }}>{r.upc}</span>
              <span className="font-secondary text-xs text-foreground" style={{ width: 220 }}>{r.name}</span>
              <span className="font-secondary text-xs text-muted-foreground" style={{ width: 120 }}>{r.brand}</span>
              <span className="font-primary text-xs font-semibold text-foreground text-right" style={{ width: 80 }}>{r.msrp}</span>
              <div className="flex justify-center flex-1">
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: '#22C55E15', color: '#22C55E' }}>Imported</span>
              </div>
            </div>
          ))}
        </div>
    </div>
  );
}
