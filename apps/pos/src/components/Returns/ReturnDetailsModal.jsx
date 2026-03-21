import { useEffect, useState } from 'react';
import { getReturnReceiptData } from '../../api/returns';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value || '-'}</span>
    </div>
  );
}

export default function ReturnDetailsModal({ returnId, isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!isOpen || !returnId) {
        setData(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      const result = await getReturnReceiptData(returnId);
      if (cancelled) return;

      if (result.success) {
        setData(result.data);
      } else {
        setData(null);
        setError(result.error || 'Failed to load return details');
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, returnId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Return Details</h2>
            {data?.return?.number && (
              <p className="text-sm text-gray-500">{data.return.number}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading return details...</div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : data ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-4">
                  <h3 className="mb-3 font-semibold text-gray-900">Return Summary</h3>
                  <div className="space-y-2">
                    <DetailRow label="Original Sale" value={data.return.originalTransactionNumber} />
                    <DetailRow label="Return Type" value={data.return.type} />
                    <DetailRow label="Refund Method" value={data.return.refundMethod?.replaceAll('_', ' ')} />
                    <DetailRow label="Processed By" value={data.return.processedBy} />
                    <DetailRow label="Completed" value={formatDateTime(data.return.date)} />
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <h3 className="mb-3 font-semibold text-gray-900">Customer</h3>
                  <div className="space-y-2">
                    <DetailRow label="Name" value={data.return.customer || 'Walk-in'} />
                    <DetailRow label="Email" value={data.return.customerEmail} />
                    <DetailRow label="Phone" value={data.return.customerPhone} />
                    {data.storeCredit?.code && (
                      <DetailRow label="Store Credit" value={`${data.storeCredit.code} (${formatCurrency(data.storeCredit.originalAmount)})`} />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 font-semibold text-gray-900">Refunded Items</h3>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-gray-500">
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 font-medium">Qty</th>
                        <th className="px-4 py-3 font-medium">Condition</th>
                        <th className="px-4 py-3 font-medium">Reason</th>
                        <th className="px-4 py-3 text-right font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{item.name}</div>
                            {item.sku && <div className="text-xs text-gray-500">{item.sku}</div>}
                            {item.reasonNotes && <div className="mt-1 text-xs text-gray-400">{item.reasonNotes}</div>}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{item.quantity}</td>
                          <td className="px-4 py-3 text-gray-700">{item.condition}</td>
                          <td className="px-4 py-3 text-gray-700">{item.reasonDescription || item.reasonCode || '-'}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="mb-3 font-semibold text-gray-900">Refund Allocations</h3>
                  <div className="space-y-2">
                    {data.allocations.length > 0 ? data.allocations.map((allocation) => (
                      <div key={allocation.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          {allocation.cardBrand && allocation.cardLastFour
                            ? `${allocation.cardBrand} ****${allocation.cardLastFour}`
                            : allocation.method?.replaceAll('_', ' ')}
                        </span>
                        <span className="font-medium text-gray-900">{formatCurrency(allocation.amount)}</span>
                      </div>
                    )) : (
                      <p className="text-sm text-gray-500">No allocation details recorded.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="mb-3 font-semibold text-gray-900">Totals</h3>
                  <div className="space-y-2">
                    <DetailRow label="Subtotal" value={formatCurrency(data.totals.subtotal)} />
                    <DetailRow label="Tax" value={formatCurrency(data.totals.tax)} />
                    <DetailRow label="Restocking Fee" value={formatCurrency(data.totals.restockingFee)} />
                    <div className="border-t border-gray-200 pt-2">
                      <DetailRow label="Total Refund" value={formatCurrency(data.totals.total)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
