/**
 * ProductDetailNew.jsx — Screen 31
 * TeleTime Design System · Product Detail Page
 * Slide-in right panel (same pattern as OrderDetailNew)
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Star,
  Download,
  Pencil,
  Copy,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Package,
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useToast } from '../ui/Toast';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCents(cents) {
  if (!cents && cents !== 0) return '—';
  return `$${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function stockBadge(status, qty) {
  const map = {
    in_stock:     { bg: 'rgba(34,197,94,0.08)',  color: '#22C55E', label: `In Stock${qty != null ? ` (${qty})` : ''}` },
    low_stock:    { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B', label: `Low Stock${qty != null ? ` (${qty})` : ''}` },
    out_of_stock: { bg: 'rgba(239,68,68,0.08)',  color: '#EF4444', label: 'Out of Stock' },
  };
  return map[status] || { bg: 'rgba(100,116,139,0.08)', color: '#64748B', label: status || '—' };
}

function InfoCard({ title, children }) {
  return (
    <div className="flex flex-col bg-secondary rounded-[10px] p-4 gap-2.5">
      <span className="text-foreground font-secondary text-[13px] font-semibold">{title}</span>
      {children}
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground font-secondary text-[12px]">{label}</span>
      {children}
    </div>
  );
}

const STORE_COLS = [
  { label: 'Store',    w: 'w-[160px]' },
  { label: 'Price',    w: 'w-[100px]' },
  { label: 'Currency', w: 'w-[70px]' },
  { label: 'Updated',  w: 'w-[100px]' },
  { label: 'Link',     w: 'w-[60px]' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProductDetailNew({ productId, onClose }) {
  const toast = useToast();
  const [product, setProduct] = useState(null);
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [productRes, competitorRes] = await Promise.all([
        apiClient.get(`/api/products/${productId}`),
        apiClient.get(`/api/products/${productId}/competitor-prices`)
          .catch(() => ({ data: { data: [] } })),
      ]);
      setProduct(productRes.data);
      setCompetitors(competitorRes.data?.data || competitorRes.data || []);
    } catch (err) {
      setError(err.response?.status === 404 ? 'Product not found' : err.message);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!productId) return null;

  const p = product;
  const margin = p && p.msrp_cents ? ((p.msrp_cents - (p.cost_cents || 0)) / p.msrp_cents * 100) : 0;
  const profit = p ? (p.msrp_cents || 0) - (p.cost_cents || 0) : 0;
  const sb = p ? stockBadge(p.stock_status, p.qty_on_hand) : null;

  return (
    <motion.div
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 80, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="w-[680px] h-full bg-background border-l border-border flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Package size={20} className="text-primary" />
          {p && (
            <span className="text-foreground font-primary text-[16px] font-bold">{p.name || p.model}</span>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
          <X size={18} className="text-muted-foreground" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5">
        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={28} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-2 py-12">
            <AlertTriangle size={24} className="text-destructive" />
            <span className="text-destructive font-secondary text-sm">{error}</span>
          </div>
        )}

        {/* Content */}
        {!loading && p && (
          <>
            {/* Product Hero */}
            <div className="flex gap-4">
              {/* Image placeholder */}
              <div className="w-[140px] h-[140px] shrink-0 bg-secondary rounded-xl flex items-center justify-center">
                <span className="text-muted-foreground text-[36px] leading-none">&#x1F5BC;</span>
              </div>

              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-foreground font-secondary text-[18px] font-bold">{p.name || p.model}</h2>
                  <Star size={18} className="text-[#F59E0B] fill-[#F59E0B] shrink-0" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-secondary text-secondary-foreground font-primary text-[11px]">
                    {p.manufacturer || '—'}
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-primary/10 text-primary font-primary text-[11px]">
                    {p.category_info?.display_name || p.category || p.master_category || '—'}
                  </span>
                  <span
                    className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: sb.bg, color: sb.color }}
                  >
                    {sb.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground font-secondary text-[12px]">Model:</span>
                  <span className="text-[#6366F1] font-primary text-[13px] font-semibold">{p.model}</span>
                </div>
                {p.description && (
                  <p className="text-muted-foreground font-secondary text-[12px] leading-relaxed line-clamp-3">
                    {p.description}
                  </p>
                )}
                {/* Tags */}
                <div className="flex items-center gap-2 mt-1">
                  {p.upc && (
                    <span className="inline-flex items-center px-2 py-[3px] rounded-md bg-secondary text-muted-foreground font-secondary text-[10px]">
                      UPC: {p.upc}
                    </span>
                  )}
                  {p.sku && (
                    <span className="inline-flex items-center px-2 py-[3px] rounded-md bg-secondary text-muted-foreground font-secondary text-[10px]">
                      SKU: {p.sku}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Info Cards Grid */}
            <div className="grid grid-cols-3 gap-3">
              {/* Pricing */}
              <InfoCard title="Pricing">
                <InfoRow label="Cost">
                  <span className="text-foreground font-primary text-[12px] font-semibold">{formatCents(p.cost_cents)}</span>
                </InfoRow>
                <InfoRow label="MSRP">
                  <span className="text-[#22C55E] font-primary text-[12px] font-semibold">{formatCents(p.msrp_cents)}</span>
                </InfoRow>
                <InfoRow label="Profit">
                  <span className="text-[#22C55E] font-primary text-[12px] font-semibold">{formatCents(profit)}</span>
                </InfoRow>
                <InfoRow label="Margin">
                  <span className="inline-flex items-center px-2 py-[2px] rounded-full bg-[rgba(34,197,94,0.08)] text-[#22C55E] font-primary text-[11px] font-semibold">
                    {margin.toFixed(1)}%
                  </span>
                </InfoRow>
                {p.retail_price_cents && (
                  <InfoRow label="Retail">
                    <span className="text-foreground font-primary text-[12px]">{formatCents(p.retail_price_cents)}</span>
                  </InfoRow>
                )}
              </InfoCard>

              {/* Details */}
              <InfoCard title="Details">
                <InfoRow label="Manufacturer">
                  <span className="text-foreground font-secondary text-[12px] font-medium">{p.manufacturer || '—'}</span>
                </InfoRow>
                <InfoRow label="Category">
                  <span className="text-foreground font-secondary text-[12px] font-medium">{p.category_info?.display_name || p.category || '—'}</span>
                </InfoRow>
                {p.color && (
                  <InfoRow label="Color/Finish">
                    <span className="text-foreground font-secondary text-[12px] font-medium">{p.color}</span>
                  </InfoRow>
                )}
                <InfoRow label="Last Updated">
                  <span className="text-foreground font-secondary text-[12px] font-medium">{formatDate(p.updated_at)}</span>
                </InfoRow>
                <InfoRow label="Stock">
                  <span
                    className="inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: sb.bg, color: sb.color }}
                  >
                    {sb.label}
                  </span>
                </InfoRow>
              </InfoCard>

              {/* Additional Info */}
              <InfoCard title="Additional">
                {p.promo_cost_cents && (
                  <InfoRow label="Promo Price">
                    <span className="text-primary font-primary text-[12px] font-semibold">{formatCents(p.promo_cost_cents)}</span>
                  </InfoRow>
                )}
                {p.map_price_cents && (
                  <InfoRow label="MAP Price">
                    <span className="text-foreground font-primary text-[12px]">{formatCents(p.map_price_cents)}</span>
                  </InfoRow>
                )}
                <InfoRow label="On Hand">
                  <span className="text-foreground font-secondary text-[12px] font-medium">{p.qty_on_hand ?? '—'}</span>
                </InfoRow>
                <InfoRow label="Reserved">
                  <span className="text-foreground font-secondary text-[12px] font-medium">{p.qty_reserved ?? '—'}</span>
                </InfoRow>
                <InfoRow label="Available">
                  <span className="text-foreground font-secondary text-[12px] font-medium">{p.qty_available ?? '—'}</span>
                </InfoRow>
                <InfoRow label="Created">
                  <span className="text-foreground font-secondary text-[12px] font-medium">{formatDate(p.created_at)}</span>
                </InfoRow>
              </InfoCard>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => toast.info('Product edit coming soon')}
                className="flex items-center gap-1.5 h-10 px-5 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
              >
                <Pencil size={12} />
                Edit Product
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => toast.info('Duplicate coming soon')}
                className="flex items-center gap-1.5 h-10 px-5 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
              >
                <Copy size={12} />
                Duplicate
              </motion.button>
            </div>

            {/* Barcode Card */}
            {(p.upc || p.sku || p.barcode) && (
              <div className="flex flex-col bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-primary text-lg">&#x2588;&#x2588;</span>
                  <span className="text-foreground font-secondary text-sm font-semibold">Barcode</span>
                </div>
                <div className="flex flex-col gap-2 p-4 items-center">
                  <div className="w-full h-[60px] bg-secondary rounded-lg flex items-center justify-center overflow-hidden">
                    <span className="text-foreground font-primary text-[18px] font-black tracking-[-2px]">
                      |||||| |||| ||| |||||||| |||| ||||||| ||||
                    </span>
                  </div>
                  <span className="text-foreground font-primary text-sm font-semibold tracking-[2px]">
                    {p.upc || p.barcode || p.sku}
                  </span>
                  <span className="text-muted-foreground font-secondary text-[11px]">
                    {p.upc ? 'Format: EAN-13' : 'SKU'}
                  </span>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => toast.info('Barcode download coming soon')}
                    className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
                  >
                    <Download size={14} />
                    Download PNG
                  </motion.button>
                </div>
              </div>
            )}

            {/* Competitor Prices */}
            <div className="flex flex-col bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-primary text-lg">&#x1F3EA;</span>
                <span className="text-foreground font-secondary text-sm font-semibold">Online Stores — Competitor Prices</span>
              </div>

              {competitors.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <span className="text-muted-foreground font-secondary text-sm">No competitor data available</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center px-4 py-2 bg-secondary" style={{ borderBottom: '1px solid var(--border)' }}>
                    {STORE_COLS.map((col) => (
                      <span key={col.label} className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold`}>
                        {col.label}
                      </span>
                    ))}
                  </div>
                  {competitors.map((row, i) => {
                    const priceCents = row.competitor_price;
                    const isLowest = competitors.every((c) => c.competitor_price >= priceCents);
                    return (
                      <div
                        key={row.competitor_name + i}
                        className={`flex items-center px-4 py-2 ${i % 2 !== 0 ? 'bg-secondary' : ''}`}
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <span className="w-[160px] shrink-0 text-foreground font-secondary text-[12px] font-medium">
                          {row.competitor_name}
                        </span>
                        <div className="w-[100px] shrink-0 flex items-center gap-1">
                          <span className="text-foreground font-primary text-[12px]">{formatCents(priceCents)}</span>
                          {isLowest && (
                            <span className="inline-flex items-center px-1.5 py-[1px] rounded-full bg-[rgba(34,197,94,0.08)] text-[#22C55E] font-primary text-[9px] font-medium">
                              LOW
                            </span>
                          )}
                        </div>
                        <span className="w-[70px] shrink-0 text-muted-foreground font-secondary text-[12px]">
                          {row.currency || 'CAD'}
                        </span>
                        <span className="w-[100px] shrink-0 text-muted-foreground font-secondary text-[12px]">
                          {formatDate(row.last_fetched_at)}
                        </span>
                        <span className="w-[60px] shrink-0">
                          {row.competitor_url ? (
                            <button
                              onClick={() => window.open(row.competitor_url, '_blank')}
                              className="text-primary font-secondary text-[12px] font-medium hover:underline flex items-center gap-1"
                            >
                              View <ExternalLink size={10} />
                            </button>
                          ) : (
                            <span className="text-muted-foreground font-secondary text-[11px]">—</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
