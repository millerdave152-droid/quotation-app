/**
 * FulfillmentTrackerNew.jsx — Screen 62
 * TeleTime Design System · Fulfillment Tracker
 * Design frame: IFghE
 */

import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const steps = [
  { label: 'Ordered', date: 'Feb 20, 10:30 AM', done: true, color: '#22C55E' },
  { label: 'Confirmed', date: 'Feb 20, 11:15 AM', done: true, color: '#22C55E' },
  { label: 'Packed', date: 'Feb 21, 2:45 PM', done: true, color: '#22C55E' },
  { label: 'Shipped', date: 'Feb 22, 9:00 AM', done: true, color: '#3B82F6' },
  { label: 'Delivered', date: 'Pending', done: false, color: 'var(--border)' },
];

const lineColors = ['#22C55E', '#22C55E', '#3B82F6', 'var(--border)'];

const orderDetails = [
  { label: 'Order Number', value: 'ORD-2026-00847', bold: true },
  { label: 'Customer', value: 'Acme Industries', semi: true },
  { label: 'Order Date', value: 'February 20, 2026' },
  { label: 'Items', value: '4 items' },
  { label: 'Total Value', value: '$1,118.52', bold: true },
];

const shippingDetails = [
  { label: 'Carrier', value: 'FedEx Express', semi: true },
  { label: 'Tracking #', value: 'FX-7829-4516-3201', link: true },
  { label: 'Ship Date', value: 'February 22, 2026' },
  { label: 'Est. Delivery', value: 'February 25, 2026', semi: true },
  { label: 'Destination', value: '123 Main St, Toronto, ON M5V 2T6' },
];

const lineItems = [
  { product: 'Industrial Widget Pro', sku: 'IWP-4521', qty: '5', price: '$149.99', status: 'Packed', statusColor: '#22C55E' },
  { product: 'Precision Sensor Kit', sku: 'PSK-1102', qty: '2', price: '$89.50', status: 'Shipped', statusColor: '#3B82F6' },
  { product: 'Control Module V3', sku: 'CMV3-887', qty: '1', price: '$245.00', status: 'Shipped', statusColor: '#3B82F6' },
  { product: 'Mounting Bracket Set', sku: 'MBS-2204', qty: '3', price: '$34.99', status: 'Pending', statusColor: '#F59E0B' },
];

const itemCols = [
  { label: 'Product', w: 'flex-1' },
  { label: 'SKU', w: 'w-[100px]' },
  { label: 'Qty', w: 'w-[50px]' },
  { label: 'Price', w: 'w-[70px]' },
  { label: 'Status', w: 'w-[80px]' },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function DetailCard({ title, icon, rows }) {
  return (
    <div className="flex flex-col bg-card border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="material-symbols-rounded text-[18px] text-primary">{icon}</span>
        <span className="text-foreground font-secondary text-sm font-semibold">{title}</span>
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-muted-foreground font-secondary text-xs">{row.label}</span>
            <span
              className="font-secondary text-xs"
              style={{
                color: row.link ? '#3B82F6' : 'var(--foreground)',
                fontWeight: row.bold ? 700 : row.semi ? 500 : 'normal',
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FulfillmentTrackerNew() {
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Orders', 'Fulfillment Tracker']}
        rightContent={
          <button className="h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm">
            Back to Orders
          </button>
        }
      />

      <div className="flex-1 flex flex-col gap-6 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-foreground font-primary text-[22px] font-bold">ORD-2026-00847</span>
          <span className="text-muted-foreground font-secondary text-sm">Acme Industries</span>
          <span className="px-3 py-1 rounded-full font-secondary text-[11px] font-semibold" style={{ backgroundColor: '#3B82F615', color: '#3B82F6' }}>
            Shipped
          </span>
          <div className="flex-1" />
          <button className="h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm">
            Print
          </button>
          <button className="h-10 px-4 rounded-lu-pill border border-border text-foreground font-primary text-sm font-medium">
            Export
          </button>
        </div>

        {/* Timeline */}
        <div className="flex items-center gap-2 bg-card rounded-xl border border-border px-8 py-6">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              {/* Step */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: step.color }}
                />
                <span
                  className="font-secondary text-xs text-center"
                  style={{
                    color: step.done ? 'var(--foreground)' : 'var(--muted-foreground)',
                    fontWeight: step.done ? 600 : 'normal',
                  }}
                >
                  {step.label}
                </span>
                <span className="text-muted-foreground font-secondary text-[10px] text-center">{step.date}</span>
              </div>
              {/* Line */}
              {i < steps.length - 1 && (
                <div
                  className="h-1 flex-1 rounded-sm -mt-8"
                  style={{ backgroundColor: lineColors[i] }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Two-column layout */}
        <div className="flex gap-6 flex-1">
          {/* Left column */}
          <div className="flex flex-col gap-6 flex-1">
            <DetailCard title="Order Details" icon="inventory_2" rows={orderDetails} />
            <DetailCard title="Shipping Details" icon="local_shipping" rows={shippingDetails} />
          </div>

          {/* Right column — Line Items */}
          <div className="flex flex-col flex-1 bg-card border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="material-symbols-rounded text-[18px] text-primary">list_alt</span>
              <span className="text-foreground font-secondary text-sm font-semibold">Line Items</span>
            </div>

            {/* Column headers */}
            <div className="flex items-center px-4 py-2 bg-secondary">
              {itemCols.map((col) => (
                <span key={col.label} className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[10px] font-semibold`}>
                  {col.label}
                </span>
              ))}
            </div>

            {/* Item rows */}
            {lineItems.map((item, i) => (
              <div
                key={item.sku}
                className="flex items-center px-4 py-2.5"
                style={i < lineItems.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
              >
                <span className="flex-1 shrink-0 text-foreground font-secondary text-xs">{item.product}</span>
                <span className="w-[100px] shrink-0 text-muted-foreground font-secondary text-[11px]">{item.sku}</span>
                <span className="w-[50px] shrink-0 text-foreground font-secondary text-xs font-semibold">{item.qty}</span>
                <span className="w-[70px] shrink-0 text-foreground font-primary text-xs">{item.price}</span>
                <div className="w-[80px] shrink-0">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full font-secondary text-[9px] font-medium"
                    style={{ backgroundColor: `${item.statusColor}15`, color: item.statusColor }}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
