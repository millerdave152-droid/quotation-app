/**
 * ReceivingWorkflowNew.jsx — Screen 75
 * TeleTime Design System · Receiving Workflow
 * Design frame: HkWqO
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
// import LunarisSidebar from '../shared/LunarisSidebar'; // removed — MainLayout provides sidebar
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
  { label: 'Actions',  w: 'w-[60px]' },
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

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/api/purchase-orders/receiving-queue');
        const payload = res.data?.data || res.data;
        setQueue(Array.isArray(payload) ? payload : (payload.queue || payload.purchaseOrders || []));
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { queue, loading };
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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ReceivingWorkflowNew() {
  const toast = useToast();
  const [selectedPOId, setSelectedPOId] = useState(null);
  const [barcode, setBarcode] = useState('');
  const [lastScanned, setLastScanned] = useState('');

  const stats = useReceivingStats();
  const { queue, loading: queueLoading } = useReceivingQueue();
  const { po, loading: poLoading } = usePODetail(selectedPOId);

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
                  return (
                    <div
                      key={item.id || i}
                      className="flex items-center px-4 py-2.5"
                      style={i < poItems.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
                    >
                      <span className="w-[100px] shrink-0 text-muted-foreground font-primary text-[11px]">
                        {item.sku || item.product_sku || '—'}
                      </span>
                      <span className="flex-1 shrink-0 text-foreground font-secondary text-xs">
                        {item.product_name || item.productName || '—'}
                      </span>
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
                      <div className="w-[60px] shrink-0 flex justify-end">
                        <span className="material-symbols-rounded text-[16px] text-muted-foreground cursor-pointer hover:text-foreground">
                          more_vert
                        </span>
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
