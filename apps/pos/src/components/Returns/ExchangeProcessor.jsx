/**
 * TeleTime POS - Exchange Processor
 * Multi-step modal: select return items → search replacements → review difference → process
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getReasonCodes, getReturnItems } from '../../api/returns';
import { calculateExchange, processExchange } from '../../api/exchanges';
import api from '../../api/axios';

const CONDITION_OPTIONS = [
  { value: 'resellable', label: 'Resellable', color: 'text-green-400 bg-green-900/50 border-green-800' },
  { value: 'damaged', label: 'Damaged', color: 'text-yellow-400 bg-yellow-900/50 border-yellow-800' },
  { value: 'defective', label: 'Defective', color: 'text-red-400 bg-red-900/50 border-red-800' },
];

const STEPS = ['return_items', 'replacement_items', 'review', 'complete'];

export default function ExchangeProcessor({ transaction, onClose, onComplete }) {
  const [step, setStep] = useState('return_items');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Return items state
  const [reasonCodes, setReasonCodes] = useState([]);
  const [transactionItems, setTransactionItems] = useState([]);
  const [itemSelections, setItemSelections] = useState({});

  // Replacement items state
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [replacementItems, setReplacementItems] = useState([]); // [{ product, quantity }]
  const searchRef = useRef(null);

  // Review state
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  const formatCents = (cents) => `$${(Math.abs(cents) / 100).toFixed(2)}`;
  const formatDollars = (amount) => `$${Number(amount).toFixed(2)}`;

  // Initialize — load reason codes and transaction items
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [codesRes, itemsRes] = await Promise.all([
          getReasonCodes(),
          getReturnItems(transaction.id || transaction.transaction_id),
        ]);

        if (codesRes.success) setReasonCodes(codesRes.data || []);
        if (itemsRes.success) {
          const items = itemsRes.data || [];
          setTransactionItems(items);
          const selections = {};
          items.forEach(item => {
            selections[item.item_id] = {
              selected: false,
              quantity: item.quantity,
              reasonCodeId: '',
              reasonNotes: '',
              condition: 'resellable',
            };
          });
          setItemSelections(selections);
        }
      } catch {
        setError('Failed to load transaction details');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [transaction]);

  // Toggle item selection
  const toggleItem = (itemId) => {
    setItemSelections(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], selected: !prev[itemId].selected },
    }));
  };

  const updateItem = (itemId, field, value) => {
    setItemSelections(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const selectedReturnItems = Object.entries(itemSelections)
    .filter(([, v]) => v.selected)
    .map(([id, v]) => ({ transactionItemId: Number(id), ...v }));

  // Product search for replacements
  const handleProductSearch = useCallback(async (query) => {
    if (!query.trim()) { setProductResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await api.get('/products', { params: { search: query, limit: 10 } });
      setProductResults(res.data?.data || res.data || []);
    } catch {
      setProductResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      handleProductSearch(productSearch);
    }, 300);
    return () => clearTimeout(searchRef.current);
  }, [productSearch, handleProductSearch]);

  const addReplacementItem = (product) => {
    setReplacementItems(prev => {
      const existing = prev.find(r => r.product.id === product.id);
      if (existing) {
        return prev.map(r => r.product.id === product.id ? { ...r, quantity: r.quantity + 1 } : r);
      }
      return [...prev, { product, quantity: 1 }];
    });
    setProductSearch('');
    setProductResults([]);
  };

  const updateReplacementQty = (productId, qty) => {
    if (qty < 1) {
      setReplacementItems(prev => prev.filter(r => r.product.id !== productId));
    } else {
      setReplacementItems(prev => prev.map(r => r.product.id === productId ? { ...r, quantity: qty } : r));
    }
  };

  const removeReplacementItem = (productId) => {
    setReplacementItems(prev => prev.filter(r => r.product.id !== productId));
  };

  // Calculate preview when moving to review step
  const handleGoToReview = async () => {
    setPreviewLoading(true);
    setError(null);
    const res = await calculateExchange({
      originalTransactionId: transaction.id || transaction.transaction_id,
      returnItemIds: selectedReturnItems.map(i => ({ transactionItemId: i.transactionItemId, quantity: i.quantity })),
      newItems: replacementItems.map(r => ({ productId: r.product.id, quantity: r.quantity })),
    });
    setPreviewLoading(false);
    if (res.success) {
      setPreview(res.data);
      setStep('review');
    } else {
      setError(res.error || 'Failed to calculate exchange');
    }
  };

  // Process the exchange
  const handleProcess = async () => {
    setProcessing(true);
    setError(null);
    const payload = {
      originalTransactionId: transaction.id || transaction.transaction_id,
      returnItems: selectedReturnItems.map(i => ({
        transactionItemId: i.transactionItemId,
        quantity: i.quantity,
        reasonCodeId: i.reasonCodeId || null,
        reasonNotes: i.reasonNotes || null,
        condition: i.condition,
      })),
      newItems: replacementItems.map(r => ({ productId: r.product.id, quantity: r.quantity })),
      differenceMethod: preview?.customerRefund ? 'store_credit' : undefined,
    };

    const res = await processExchange(payload);
    setProcessing(false);
    if (res.success) {
      setResult(res.data);
      setStep('complete');
    } else {
      setError(res.error || 'Failed to process exchange');
    }
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white">Exchange</h2>
            <p className="text-xs text-slate-400">
              {transaction.transaction_number} — {transaction.customer_name || 'Walk-in'}
            </p>
          </div>
          {step !== 'complete' && (
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-800 text-xs">
          {['Return Items', 'Replacements', 'Review', 'Complete'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className="w-6 h-px bg-slate-700" />}
              <span className={i <= stepIndex ? 'text-blue-400 font-medium' : 'text-slate-500'}>{label}</span>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-3 bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* STEP 1: Select return items */}
          {step === 'return_items' && !loading && (
            <div className="space-y-3">
              <p className="text-sm text-slate-300 mb-4">Select items the customer is returning:</p>
              {transactionItems.map(item => {
                const sel = itemSelections[item.item_id] || {};
                return (
                  <div key={item.item_id} className={`border rounded-lg p-3 transition-colors ${sel.selected ? 'border-blue-500 bg-slate-800' : 'border-slate-700 bg-slate-800/50'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={sel.selected || false}
                        onChange={() => toggleItem(item.item_id)}
                        className="w-4 h-4 rounded"
                      />
                      <div className="flex-1">
                        <p className="text-white font-medium text-sm">{item.product_name}</p>
                        <p className="text-xs text-slate-500">{item.product_sku} — Qty: {item.quantity} @ {formatDollars(item.unit_price)}</p>
                      </div>
                      <p className="text-white font-medium">{formatDollars(item.line_total)}</p>
                    </div>

                    {sel.selected && (
                      <div className="mt-3 pl-7 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Return Qty</label>
                          <input
                            type="number" min={1} max={item.quantity}
                            value={sel.quantity}
                            onChange={(e) => updateItem(item.item_id, 'quantity', Math.min(Number(e.target.value) || 1, item.quantity))}
                            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Reason</label>
                          <select
                            value={sel.reasonCodeId}
                            onChange={(e) => updateItem(item.item_id, 'reasonCodeId', e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                          >
                            <option value="">Select reason...</option>
                            {reasonCodes.map(rc => (
                              <option key={rc.id} value={rc.id}>{rc.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2 flex gap-2">
                          {CONDITION_OPTIONS.map(c => (
                            <button
                              key={c.value}
                              onClick={() => updateItem(item.item_id, 'condition', c.value)}
                              className={`px-2 py-1 text-xs rounded border ${sel.condition === c.value ? c.color : 'text-slate-500 bg-slate-800 border-slate-700'}`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* STEP 2: Search and add replacement items */}
          {step === 'replacement_items' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300 mb-2">Search for replacement items:</p>

              <div className="relative">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name or SKU..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                {searchLoading && (
                  <div className="absolute right-3 top-3">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {productResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {productResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addReplacementItem(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-700 border-b border-slate-700/50 last:border-0"
                      >
                        <div className="text-white text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-slate-400">{p.sku} — {formatDollars(p.selling_price)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected replacement items */}
              {replacementItems.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Replacement Items</p>
                  {replacementItems.map(r => (
                    <div key={r.product.id} className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg p-3">
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{r.product.name}</p>
                        <p className="text-xs text-slate-500">{r.product.sku} — {formatDollars(r.product.selling_price)} ea.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateReplacementQty(r.product.id, r.quantity - 1)}
                          className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm flex items-center justify-center"
                        >-</button>
                        <span className="text-white text-sm w-6 text-center">{r.quantity}</span>
                        <button
                          onClick={() => updateReplacementQty(r.product.id, r.quantity + 1)}
                          className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm flex items-center justify-center"
                        >+</button>
                      </div>
                      <p className="text-white font-medium w-20 text-right">
                        {formatDollars(r.product.selling_price * r.quantity)}
                      </p>
                      <button onClick={() => removeReplacementItem(r.product.id)} className="text-slate-500 hover:text-red-400 text-lg">&times;</button>
                    </div>
                  ))}
                </div>
              )}

              {replacementItems.length === 0 && (
                <p className="text-center text-slate-500 py-8">Search above to add replacement items</p>
              )}
            </div>
          )}

          {/* STEP 3: Review */}
          {step === 'review' && preview && (
            <div className="space-y-4">
              {/* Return credit */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">Return Credit</p>
                <p className="text-2xl font-bold text-orange-400">{formatCents(preview.returnCreditCents)}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedReturnItems.length} item{selectedReturnItems.length !== 1 ? 's' : ''} being returned
                </p>
              </div>

              {/* New items total */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">New Items Total (incl. tax)</p>
                <p className="text-2xl font-bold text-blue-400">{formatCents(preview.newTotalCents)}</p>
                <div className="mt-2 space-y-1">
                  {preview.newItems?.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs text-slate-400">
                      <span>{item.productName} x{item.quantity}</span>
                      <span>{formatDollars(item.lineTotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Difference */}
              <div className={`border rounded-lg p-4 ${
                preview.evenExchange ? 'bg-green-900/30 border-green-800' :
                preview.customerOwes ? 'bg-orange-900/30 border-orange-800' :
                'bg-blue-900/30 border-blue-800'
              }`}>
                <p className="text-xs font-medium uppercase tracking-wider mb-2 text-slate-400">Price Difference</p>
                {preview.evenExchange && (
                  <p className="text-xl font-bold text-green-400">Even Exchange — No Payment Required</p>
                )}
                {preview.customerOwes && (
                  <>
                    <p className="text-xl font-bold text-orange-400">Customer Owes: {formatCents(preview.differenceCents)}</p>
                    <p className="text-xs text-slate-400 mt-1">Payment will be collected at processing</p>
                  </>
                )}
                {preview.customerRefund && (
                  <>
                    <p className="text-xl font-bold text-blue-400">Customer Refund: {formatCents(Math.abs(preview.differenceCents))}</p>
                    <p className="text-xs text-slate-400 mt-1">Store credit will be issued for the difference</p>
                  </>
                )}
              </div>
            </div>
          )}

          {previewLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* STEP 4: Complete */}
          {step === 'complete' && result && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-900/50 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">Exchange Complete</h3>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-left space-y-2 max-w-sm mx-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Return #</span>
                  <span className="text-white font-mono">{result.returnNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">New Invoice #</span>
                  <span className="text-blue-400 font-mono">{result.exchangeTransactionNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Return Credit</span>
                  <span className="text-orange-400">{formatCents(result.returnCreditCents)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">New Total</span>
                  <span className="text-white">{formatCents(result.newTotalCents)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
                  <span className="text-slate-400">Difference</span>
                  <span className={result.differenceCents > 0 ? 'text-orange-400' : result.differenceCents < 0 ? 'text-blue-400' : 'text-green-400'}>
                    {result.differenceCents === 0 ? 'Even' : formatCents(result.differenceCents)}
                  </span>
                </div>
                {result.storeCredit && (
                  <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
                    <span className="text-slate-400">Store Credit</span>
                    <span className="text-emerald-400 font-mono">{result.storeCredit.code}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
          {step === 'return_items' && (
            <>
              <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg">Cancel</button>
              <button
                onClick={() => setStep('replacement_items')}
                disabled={selectedReturnItems.length === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg"
              >
                Next: Select Replacements
              </button>
            </>
          )}
          {step === 'replacement_items' && (
            <>
              <button onClick={() => setStep('return_items')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg">Back</button>
              <button
                onClick={handleGoToReview}
                disabled={replacementItems.length === 0 || previewLoading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg"
              >
                {previewLoading ? 'Calculating...' : 'Next: Review Exchange'}
              </button>
            </>
          )}
          {step === 'review' && (
            <>
              <button onClick={() => setStep('replacement_items')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg">Back</button>
              <button
                onClick={handleProcess}
                disabled={processing}
                className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg"
              >
                {processing ? 'Processing...' : 'Process Exchange'}
              </button>
            </>
          )}
          {step === 'complete' && (
            <button
              onClick={() => onComplete?.(result)}
              className="ml-auto px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
