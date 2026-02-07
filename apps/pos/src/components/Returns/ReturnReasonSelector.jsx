/**
 * TeleTime POS - Return Reason Selector
 * Allows selecting items to return with per-item reason codes and condition
 */

import { useState, useEffect, useCallback } from 'react';
import { getReasonCodes, getReturnItems, addReturnItems, createReturn } from '../../api/returns';

const CONDITION_OPTIONS = [
  { value: 'resellable', label: 'Resellable', color: 'text-green-400 bg-green-900/50 border-green-800' },
  { value: 'damaged', label: 'Damaged', color: 'text-yellow-400 bg-yellow-900/50 border-yellow-800' },
  { value: 'defective', label: 'Defective', color: 'text-red-400 bg-red-900/50 border-red-800' },
];

export default function ReturnReasonSelector({ transaction, onClose, onComplete }) {
  const [reasonCodes, setReasonCodes] = useState([]);
  const [transactionItems, setTransactionItems] = useState([]);
  const [returnRecord, setReturnRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Per-item return state: { [item_id]: { selected, quantity, reasonCodeId, reasonNotes, condition } }
  const [itemSelections, setItemSelections] = useState({});

  // Load reason codes and create return record
  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const originalTransactionId = transaction?.id || transaction?.transaction_id;
      if (!originalTransactionId) {
        setError('Missing original transaction ID');
        return;
      }

      // Fetch reason codes
      const codesResult = await getReasonCodes();
      if (!codesResult.success) {
        setError(codesResult.error || 'Failed to load reason codes');
        return;
      }
      setReasonCodes(codesResult.data);

      // Create return record
      const returnResult = await createReturn({
        originalTransactionId,
        returnType: 'full',
      });
      if (!returnResult.success) {
        setError(returnResult.error || 'Failed to create return');
        return;
      }
      setReturnRecord(returnResult.data);

      // Fetch transaction items via return items endpoint
      const itemsResult = await getReturnItems(returnResult.data.id);
      if (!itemsResult.success) {
        setError(itemsResult.error || 'Failed to load transaction items');
        return;
      }
      setTransactionItems(itemsResult.data.transactionItems);

      // Initialize selections - all unselected
      const selections = {};
      for (const item of itemsResult.data.transactionItems) {
        selections[item.item_id] = {
          selected: false,
          quantity: item.quantity,
          reasonCodeId: codesResult.data[0]?.id || null,
          reasonNotes: '',
          condition: 'resellable',
        };
      }
      setItemSelections(selections);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [transaction?.id, transaction?.transaction_id]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const updateItem = (itemId, field, value) => {
    setItemSelections(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const toggleSelectAll = () => {
    const allSelected = selectedItems.length === transactionItems.length;
    setItemSelections(prev => {
      const next = { ...prev };
      for (const item of transactionItems) {
        next[item.item_id] = { ...next[item.item_id], selected: !allSelected };
      }
      return next;
    });
  };

  const selectedItems = transactionItems.filter(item => itemSelections[item.item_id]?.selected);

  const getSelectedReasonCode = (itemId) => {
    const sel = itemSelections[itemId];
    return reasonCodes.find(rc => rc.id === sel?.reasonCodeId);
  };

  const canSubmit = () => {
    if (selectedItems.length === 0) return false;
    for (const item of selectedItems) {
      const sel = itemSelections[item.item_id];
      if (!sel.reasonCodeId) return false;
      if (sel.quantity < 1 || sel.quantity > item.quantity) return false;
      const rc = getSelectedReasonCode(item.item_id);
      if (rc?.requires_notes && !sel.reasonNotes.trim()) return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit() || !returnRecord) return;
    setSubmitting(true);
    setError(null);

    const items = selectedItems.map(item => {
      const sel = itemSelections[item.item_id];
      return {
        transactionItemId: item.item_id,
        quantity: sel.quantity,
        reasonCodeId: sel.reasonCodeId,
        reasonNotes: sel.reasonNotes || null,
        condition: sel.condition,
      };
    });

    const result = await addReturnItems(returnRecord.id, items);
    setSubmitting(false);

    if (result.success) {
      onComplete?.(returnRecord);
    } else {
      setError(result.error || 'Failed to submit return items');
    }
  };

  const formatCurrency = (amount) => {
    if (amount == null) return '$0.00';
    return `$${Number(amount).toFixed(2)}`;
  };

  const estimatedRefund = selectedItems.reduce((sum, item) => {
    const sel = itemSelections[item.item_id];
    const linePrice = Number(item.unit_price) * sel.quantity;
    const discount = Number(item.discount_amount || 0) * (sel.quantity / item.quantity);
    return sum + linePrice - discount;
  }, 0);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">Loading return details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Select Items to Return</h2>
            <p className="text-sm text-slate-400">
              Invoice {transaction.transaction_number} — {transaction.customer_name || 'Walk-in'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Items List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Select All */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
              <input
                type="checkbox"
                checked={selectedItems.length === transactionItems.length && transactionItems.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
              />
              Select All ({transactionItems.length} items)
            </label>
          </div>

          {transactionItems.map(item => {
            const sel = itemSelections[item.item_id];
            if (!sel) return null;
            const selectedReason = getSelectedReasonCode(item.item_id);

            return (
              <div
                key={item.item_id}
                className={`rounded-lg border p-4 transition-colors ${
                  sel.selected
                    ? 'border-blue-600 bg-slate-750 bg-blue-900/10'
                    : 'border-slate-700 bg-slate-800/50'
                }`}
              >
                {/* Item header row */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sel.selected}
                    onChange={(e) => updateItem(item.item_id, 'selected', e.target.checked)}
                    className="w-4 h-4 mt-1 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{item.product_name}</p>
                        {item.product_sku && (
                          <p className="text-xs text-slate-500">SKU: {item.product_sku}</p>
                        )}
                      </div>
                      <p className="text-white font-medium ml-4">
                        {formatCurrency(item.unit_price)} x {item.quantity}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Expanded details when selected */}
                {sel.selected && (
                  <div className="mt-4 ml-7 space-y-3">
                    {/* Quantity & Reason row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Return Quantity */}
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Return Qty</label>
                        <input
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={sel.quantity}
                          onChange={(e) => updateItem(item.item_id, 'quantity', Math.max(1, Math.min(item.quantity, parseInt(e.target.value) || 1)))}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Reason Code */}
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Reason</label>
                        <select
                          value={sel.reasonCodeId || ''}
                          onChange={(e) => updateItem(item.item_id, 'reasonCodeId', parseInt(e.target.value))}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {reasonCodes.map(rc => (
                            <option key={rc.id} value={rc.id}>{rc.description}</option>
                          ))}
                        </select>
                      </div>

                      {/* Condition */}
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Condition</label>
                        <div className="flex gap-1">
                          {CONDITION_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => updateItem(item.item_id, 'condition', opt.value)}
                              className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                                sel.condition === opt.value
                                  ? opt.color
                                  : 'text-slate-400 bg-slate-700 border-slate-600 hover:border-slate-500'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Notes (required for "Other" reason) */}
                    {selectedReason?.requires_notes && (
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">
                          Notes <span className="text-red-400">*</span>
                        </label>
                        <textarea
                          value={sel.reasonNotes}
                          onChange={(e) => updateItem(item.item_id, 'reasonNotes', e.target.value)}
                          placeholder="Please describe the reason..."
                          rows={2}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>
                    )}

                    {/* Optional notes for non-required reasons */}
                    {!selectedReason?.requires_notes && (
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Notes (optional)</label>
                        <input
                          type="text"
                          value={sel.reasonNotes}
                          onChange={(e) => updateItem(item.item_id, 'reasonNotes', e.target.value)}
                          placeholder="Additional notes..."
                          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 shrink-0">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-400">
              {selectedItems.length} of {transactionItems.length} items selected
              {selectedItems.length > 0 && (
                <span className="ml-3 text-white font-medium">
                  Est. refund: {formatCurrency(estimatedRefund)}
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit() || submitting}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {submitting ? 'Submitting...' : 'Confirm Return Items'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
