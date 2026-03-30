/**
 * ReceivingWorkflowNew.jsx — Screen 75
 * TeleTime Design System · Receiving Workflow
 * Design frame: HkWqO
 *
 * Serial number capture for serialized products (is_serialized = true).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function poStatusStyle(status) {
  const s = (status || '').toLowerCase();
  const map = {
    received:           { bg: 'rgba(34,197,94,0.08)',  color: '#22C55E' },
    fulfilled:          { bg: 'rgba(34,197,94,0.08)',  color: '#22C55E' },
    partially_received: { bg: 'rgba(59,130,246,0.08)', color: '#3B82F6' },
    in_progress:        { bg: 'rgba(59,130,246,0.08)', color: '#3B82F6' },
    pending:            { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B' },
    discrepancy:        { bg: 'rgba(239,68,68,0.08)',  color: '#EF4444' },
  };
  return map[s] || { bg: 'rgba(100,116,139,0.08)', color: '#64748B' };
}

function displayStatus(status) {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function itemStatusStyle(expected, received) {
  if (received >= expected) return { bg: 'rgba(34,197,94,0.08)', color: '#22C55E', label: 'Complete' };
  if (received > 0) return { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B', label: 'Partial' };
  return { bg: 'rgba(100,116,139,0.08)', color: '#64748B', label: 'Pending' };
}

const itemCols = [
  { label: 'SKU',      w: 'w-[100px]' },
  { label: 'Product',  w: 'flex-1' },
  { label: 'Expected', w: 'w-[70px]' },
  { label: 'Received', w: 'w-[70px]' },
  { label: 'Status',   w: 'w-[80px]' },
  { label: 'Actions',  w: 'w-[90px]' },
];

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useReceivingStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/api/purchase-orders/stats');
        setStats(res.data?.data || res.data);
      } catch { /* ignore */ }
    })();
  }, []);

  return stats;
}

function useReceivingQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/purchase-orders/receiving-queue');
      const payload = res.data?.data || res.data;
      setQueue(Array.isArray(payload) ? payload : (payload.queue || payload.purchaseOrders || []));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { queue, loading, refresh };
}

function usePODetail(poId) {
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!poId) { setPo(null); return; }
    try {
      setLoading(true);
      const res = await apiClient.get(`/api/purchase-orders/${poId}`);
      setPo(res.data?.data || res.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { po, loading, refresh: fetch };
}

/* ------------------------------------------------------------------ */
/*  SerialInputRow — one input per unit for serialized products        */
/* ------------------------------------------------------------------ */

function SerialInputRow({ index, value, onChange, autoFocus }) {
  const ref = useRef(null);

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Move focus to next sibling input if it exists
      const next = ref.current?.parentElement?.nextElementSibling?.querySelector('input');
      if (next) next.focus();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground font-secondary text-[10px] w-[18px] text-right shrink-0">
        {index + 1}.
      </span>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Scan or enter serial #${index + 1}...`}
        className="flex-1 h-8 px-3 rounded bg-background border border-input text-foreground font-secondary text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
      />
      {value && (
        <span className="text-[#22C55E] font-secondary text-[10px] shrink-0">&#10003;</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ReceiveItemPanel — per-item receiving with serial capture           */
/* ------------------------------------------------------------------ */

function ReceiveItemPanel({ item, poId, onReceived }) {
  const toast = useToast();
  const expected = item.quantity_ordered || item.quantityOrdered || 0;
  const alreadyReceived = item.quantity_received || item.quantityReceived || 0;
  const remaining = Math.max(0, expected - alreadyReceived);
  const isSerialized = item.is_serialized === true || item.is_serialized === 't';

  const [open, setOpen] = useState(false);
  const [qtyToReceive, setQtyToReceive] = useState(remaining);
  const [qtyDamaged, setQtyDamaged] = useState(0);
  const [serials, setSerials] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Reset serials array when qty changes
  useEffect(() => {
    if (isSerialized) {
      setSerials((prev) => {
        const arr = [...prev];
        while (arr.length < qtyToReceive) arr.push('');
        return arr.slice(0, qtyToReceive);
      });
    }
  }, [qtyToReceive, isSerialized]);

  const handleSerialChange = (idx, val) => {
    setSerials((prev) => {
      const arr = [...prev];
      arr[idx] = val.trim();
      return arr;
    });
  };

  const filledSerials = serials.filter((s) => s.length > 0);
  const serialsComplete = !isSerialized || filledSerials.length === qtyToReceive;
  const hasDuplicateSerials = isSerialized && new Set(filledSerials).size !== filledSerials.length;
  const canSubmit = remaining > 0 && qtyToReceive > 0 && qtyToReceive <= remaining && serialsComplete && !hasDuplicateSerials;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = {
        items: [{
          purchaseOrderItemId: item.id,
          quantityReceived: qtyToReceive,
          quantityDamaged: qtyDamaged,
          ...(isSerialized && filledSerials.length > 0 ? { serialNumbers: filledSerials } : {})
        }]
      };
      await apiClient.post(`/api/purchase-orders/${poId}/receive`, payload);
      toast.success(`Received ${qtyToReceive} × ${item.product_name || item.product_sku}`);
      setOpen(false);
      setSerials([]);
      onReceived();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Receive failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (remaining <= 0) return null;

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setOpen(!open)}
        className="h-7 px-3 rounded bg-primary/10 text-primary font-secondary text-[11px] font-medium hover:bg-primary/20 transition-colors"
      >
        {open ? 'Cancel' : 'Receive'}
      </button>

      {open && (
        <div
          className="flex flex-col gap-3 mt-2 p-3 rounded-lg border border-border bg-secondary/30"
          style={{ marginLeft: '-300px', width: '440px', position: 'relative', zIndex: 10 }}
        >
          <div className="flex items-center gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground font-secondary text-[10px]">Qty to receive</span>
              <input
                type="number"
                min={1}
                max={remaining}
                value={qtyToReceive}
                onChange={(e) => setQtyToReceive(Math.max(1, Math.min(remaining, parseInt(e.target.value) || 1)))}
                className="h-8 w-[70px] px-2 rounded bg-background border border-input text-foreground font-primary text-xs text-center outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground font-secondary text-[10px]">Qty damaged</span>
              <input
                type="number"
                min={0}
                max={qtyToReceive}
                value={qtyDamaged}
                onChange={(e) => setQtyDamaged(Math.max(0, Math.min(qtyToReceive, parseInt(e.target.value) || 0)))}
                className="h-8 w-[70px] px-2 rounded bg-background border border-input text-foreground font-primary text-xs text-center outline-none"
              />
            </label>
            <span className="text-muted-foreground font-secondary text-[10px] mt-3">
              {remaining} remaining of {expected}
            </span>
          </div>

          {/* Serial number inputs for serialized products */}
          {isSerialized && qtyToReceive > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-foreground font-secondary text-[11px] font-semibold">
                  Serial Numbers Required
                </span>
                <span
                  className="font-secondary text-[11px] font-medium"
                  style={{ color: serialsComplete ? '#22C55E' : '#F59E0B' }}
                >
                  {filledSerials.length} of {qtyToReceive} entered
                </span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-[200px] overflow-auto">
                {serials.map((val, idx) => (
                  <SerialInputRow
                    key={idx}
                    index={idx}
                    value={val}
                    onChange={handleSerialChange}
                    autoFocus={idx === 0}
                  />
                ))}
              </div>
              {hasDuplicateSerials && (
                <span className="text-[#EF4444] font-secondary text-[10px]">
                  Duplicate serial numbers detected — each serial must be unique
                </span>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between">
            {!serialsComplete && (
              <span className="text-[#F59E0B] font-secondary text-[10px]">
                Enter all {qtyToReceive} serial numbers to receive
              </span>
            )}
            {serialsComplete && !hasDuplicateSerials && <span />}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={`h-8 px-4 rounded font-secondary text-[11px] font-medium transition-colors ${
                canSubmit && !submitting
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              {submitting ? 'Receiving...' : `Confirm Receive ${qtyToReceive}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ReceivingWorkflowNew() {
  const toast = useToast();
  const [selectedPOId, setSelectedPOId] = useState(null);
  const [barcode, setBarcode] = useState('');
  const [lastScanned, setLastScanned] = useState('');

  const stats = useReceivingStats();
  const { queue, loading: queueLoading, refresh: refreshQueue } = useReceivingQueue();
  const { po, loading: poLoading, refresh: refreshPO } = usePODetail(selectedPOId);

  /* Auto-select first PO */
  useEffect(() => {
    if (queue.length > 0 && !selectedPOId) {
      setSelectedPOId(queue[0].id);
    }
  }, [queue, selectedPOId]);

  const handleScan = () => {
    if (!barcode.trim()) return;
    setLastScanned(barcode.trim());
    toast.info(`Scanned: ${barcode.trim()}`);
    setBarcode('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleScan();
  };

  const handleItemReceived = () => {
    refreshPO();
    refreshQueue();
  };

  const poItems = po?.items || [];
  const poNumber = po?.po_number || po?.poNumber || (selectedPOId ? `PO-${selectedPOId}` : '—');

  const statCards = [
    { label: 'Open POs',              value: stats?.openCount ?? stats?.open_count ?? '—', color: 'var(--foreground)' },
    { label: 'Items Received Today',  value: stats?.receivedToday ?? stats?.received_today ?? '—', color: '#22C55E' },
    { label: 'Pending Verification',  value: stats?.pendingVerification ?? stats?.pending_verification ?? '—', color: '#F59E0B' },
    { label: 'Discrepancies',         value: stats?.discrepancyCount ?? stats?.discrepancy_count ?? '—', color: '#EF4444' },
  ];

  return (
    <div className="flex-1 flex flex-col gap-6 p-8 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-primary text-2xl font-bold">Receiving Workflow</h1>
            <p className="text-muted-foreground font-secondary text-sm">Scan, verify, and receive purchase order shipments</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toast.info('PO History coming soon')}
              className="h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
            >
              PO History
            </button>
            <button
              onClick={() => toast.info('New receiving session coming soon')}
              className="h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
            >
              + New Receiving
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex gap-4">
          {statCards.map((stat) => (
            <div key={stat.label} className="flex-1 flex flex-col gap-1 bg-card rounded-lg border border-border p-4">
              <span className="text-muted-foreground font-secondary text-xs font-medium">{stat.label}</span>
              <span className="font-primary text-[28px] font-bold" style={{ color: stat.color }}>{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left — PO Sessions */}
          <div className="flex flex-col w-[340px] bg-card border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-foreground font-secondary text-sm font-semibold">Active PO Sessions</span>
              <span className="text-muted-foreground font-secondary text-[11px]">{queue.length} open</span>
            </div>
            <div className="flex-1 flex flex-col overflow-auto">
              {queueLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              )}
              {!queueLoading && queue.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <span className="text-muted-foreground font-secondary text-sm">No POs in receiving queue</span>
                </div>
              )}
              {!queueLoading && queue.map((poItem, i) => {
                const badge = poStatusStyle(poItem.status);
                const isSelected = poItem.id === selectedPOId;
                return (
                  <div
                    key={poItem.id}
                    onClick={() => setSelectedPOId(poItem.id)}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-secondary' : 'hover:bg-secondary/50'
                    }`}
                    style={i < queue.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-foreground font-primary text-[13px] font-semibold">
                        {poItem.po_number || poItem.poNumber || `PO-${poItem.id}`}
                      </span>
                      <span className="text-muted-foreground font-secondary text-[11px]">
                        {poItem.vendor_name || poItem.vendorName || '—'}
                        {poItem.item_count ? ` · ${poItem.item_count} Items` : ''}
                      </span>
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-full font-secondary text-[9px] font-medium shrink-0"
                      style={{ backgroundColor: badge.bg, color: badge.color }}
                    >
                      {displayStatus(poItem.status)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column */}
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {/* Barcode Scanner */}
            <div className="flex flex-col bg-card border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-foreground font-secondary text-sm font-semibold">Barcode Scanner</span>
                <span className="text-muted-foreground font-secondary text-[11px]">Scanner Connected</span>
              </div>
              <div className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter barcode or scan SKU..."
                    className="flex-1 h-10 px-4 rounded-lu-pill bg-background border border-input text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={handleScan}
                    className="h-10 px-5 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium shrink-0"
                  >
                    + Scan
                  </button>
                </div>
                {lastScanned && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary">
                    <span className="material-symbols-rounded text-[16px] text-[#22C55E]">check_circle</span>
                    <span className="text-muted-foreground font-secondary text-[11px]">Last scanned: {lastScanned}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Received Items */}
            <div className="flex flex-col flex-1 bg-card border border-border overflow-hidden min-h-0">
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-foreground font-secondary text-sm font-semibold">
                  Received Items — {poNumber}
                </span>
                <span className="text-muted-foreground font-secondary text-[11px]">{poItems.length} items</span>
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
              <div className="flex-1 overflow-auto">
                {poLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-muted-foreground" />
                  </div>
                )}
                {!poLoading && poItems.length === 0 && (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-muted-foreground font-secondary text-sm">
                      {selectedPOId ? 'No items in this PO' : 'Select a PO to view items'}
                    </span>
                  </div>
                )}
                {!poLoading && poItems.map((item, i) => {
                  const expected = item.quantity_ordered || item.quantityOrdered || 0;
                  const received = item.quantity_received || item.quantityReceived || 0;
                  const badge = itemStatusStyle(expected, received);
                  const isSerialized = item.is_serialized === true || item.is_serialized === 't';
                  const remaining = Math.max(0, expected - received);
                  return (
                    <div
                      key={item.id || i}
                      className="flex flex-col px-4 py-2.5"
                      style={i < poItems.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
                    >
                      <div className="flex items-center">
                        <span className="w-[100px] shrink-0 text-muted-foreground font-primary text-[11px]">
                          {item.sku || item.product_sku || '—'}
                        </span>
                        <div className="flex-1 shrink-0 flex flex-col">
                          <span className="text-foreground font-secondary text-xs">
                            {item.product_name || item.productName || '—'}
                          </span>
                          {isSerialized && (
                            <span className="text-[10px] font-secondary" style={{ color: '#3B82F6' }}>
                              Serialized product
                            </span>
                          )}
                        </div>
                        <span className="w-[70px] shrink-0 text-foreground font-primary text-xs font-semibold text-center">
                          {expected}
                        </span>
                        <span className="w-[70px] shrink-0 text-foreground font-primary text-xs font-semibold text-center">
                          {received}
                        </span>
                        <div className="w-[80px] shrink-0">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full font-secondary text-[9px] font-medium"
                            style={{ backgroundColor: badge.bg, color: badge.color }}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <div className="w-[90px] shrink-0 flex justify-end">
                          {remaining > 0 ? (
                            <ReceiveItemPanel
                              item={item}
                              poId={selectedPOId}
                              onReceived={handleItemReceived}
                            />
                          ) : (
                            <span className="text-[#22C55E] font-secondary text-[10px]">Done</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
