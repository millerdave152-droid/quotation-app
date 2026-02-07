/**
 * Read-only summary of the completed delivery, shown before final submit and after success.
 *
 * Props:
 *   delivery       — delivery object
 *   items          — order items array
 *   photos         — captured photos array
 *   signatureData  — { signature_image, signer_name, relationship, signed_at } | null
 *   arrivalTime    — ISO string or Date
 *   completionTime — ISO string or Date (defaults to now)
 *   completionType — 'delivered' | 'partial' | 'refused'
 *   notes          — completion notes string
 */
export default function CompletionSummary({
  delivery,
  items = [],
  photos = [],
  signatureData,
  arrivalTime,
  completionTime,
  completionType = 'delivered',
  notes,
}) {
  const customerName = delivery?.customer_name || delivery?.contact_name || 'Customer';
  const bookingNum = delivery?.booking_number || delivery?.id;
  const arrival = arrivalTime ? new Date(arrivalTime) : null;
  const completion = completionTime ? new Date(completionTime) : new Date();

  // Duration
  let durationText = '--';
  if (arrival) {
    const ms = completion - arrival;
    const mins = Math.round(ms / 60000);
    if (mins < 60) {
      durationText = `${mins} min`;
    } else {
      const hrs = Math.floor(mins / 60);
      const rem = mins % 60;
      durationText = `${hrs}h ${rem}m`;
    }
  }

  const typeLabels = {
    delivered: 'Delivered',
    partial: 'Partial Delivery',
    refused: 'Refused',
  };

  return (
    <div className="space-y-3">
      {/* Delivery ID & type */}
      <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
        <div>
          <p className="text-xs text-slate-400">Delivery</p>
          <p className="text-sm font-bold text-slate-900">#{bookingNum}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          completionType === 'delivered' ? 'bg-green-100 text-green-700'
            : completionType === 'partial' ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {typeLabels[completionType] || completionType}
        </span>
      </div>

      {/* Customer */}
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="text-xs text-slate-400">Customer</p>
        <p className="text-sm font-semibold text-slate-800">{customerName}</p>
        {delivery?.delivery_address && (
          <p className="mt-0.5 text-xs text-slate-500">{delivery.delivery_address}</p>
        )}
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="mb-1.5 text-xs text-slate-400">Items Delivered</p>
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-green-500">✓</span>
                <span className="flex-1 text-slate-700">{item.product_name}</span>
                <span className="text-xs text-slate-400">x{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Times */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-50 p-3 text-center">
          <p className="text-[10px] text-slate-400">Arrived</p>
          <p className="text-sm font-semibold text-slate-800">
            {arrival ? arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-center">
          <p className="text-[10px] text-slate-400">Completed</p>
          <p className="text-sm font-semibold text-slate-800">
            {completion.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-center">
          <p className="text-[10px] text-slate-400">Duration</p>
          <p className="text-sm font-semibold text-slate-800">{durationText}</p>
        </div>
      </div>

      {/* Photos & signature row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] text-slate-400">Photos</p>
          <p className="text-sm font-semibold text-slate-800">{photos.length} captured</p>
          {photos.length > 0 && (
            <div className="mt-1.5 flex gap-1">
              {photos.slice(0, 4).map(p => (
                <div key={p.id} className="h-8 w-8 overflow-hidden rounded bg-slate-200">
                  <img src={p.data} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
              {photos.length > 4 && (
                <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-[10px] text-slate-500">
                  +{photos.length - 4}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] text-slate-400">Signature</p>
          {signatureData ? (
            <>
              <p className="text-sm font-semibold text-slate-800">{signatureData.signer_name}</p>
              <div className="mt-1.5 h-10 overflow-hidden rounded border border-slate-200 bg-white">
                <img src={signatureData.signature_image} alt="Signature" className="h-full w-full object-contain" />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">Not captured</p>
          )}
        </div>
      </div>

      {/* Notes */}
      {notes && (
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] text-slate-400">Driver Notes</p>
          <p className="text-sm text-slate-700">{notes}</p>
        </div>
      )}
    </div>
  );
}
