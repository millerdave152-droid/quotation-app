/**
 * Customer360ViewNew.jsx — Screen 22
 * Quotify Design System · Customer 360 View Panel
 * Design frame: Wwtde
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  X,
  Phone,
  Building2,
  MapPin,
  FileText,
  Loader2,
} from 'lucide-react';
import { authFetch } from '../../services/authFetch';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_STYLES = {
  Won: { color: '#16A34A', bg: '#F0FDF4' },
  accepted: { color: '#16A34A', bg: '#F0FDF4' },
  converted: { color: '#16A34A', bg: '#F0FDF4' },
  Sent: { color: '#3B82F6', bg: '#EFF6FF' },
  SENT: { color: '#3B82F6', bg: '#EFF6FF' },
  Draft: { color: '#6B7280', bg: '#F3F4F6' },
  DRAFT: { color: '#6B7280', bg: '#F3F4F6' },
  Delivered: { color: '#16A34A', bg: '#F0FDF4' },
  'In Transit': { color: '#3B82F6', bg: '#EFF6FF' },
  Pending: { color: '#D97706', bg: '#FFFBEB' },
};

const getStatusStyle = (status) =>
  STATUS_STYLES[status] || { color: '#6B7280', bg: '#F3F4F6' };

const SEGMENT_COLORS = {
  platinum: { bg: 'bg-purple-500/10', text: 'text-purple-600' },
  gold: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
  silver: { bg: 'bg-slate-500/10', text: 'text-slate-600' },
  bronze: { bg: 'bg-orange-500/10', text: 'text-orange-600' },
};

const getChurnColor = (pct) => {
  if (pct > 50) return { color: '#DC2626', bg: '#FEF2F2' };
  if (pct > 20) return { color: '#D97706', bg: '#FFFBEB' };
  return { color: '#16A34A', bg: '#F0FDF4' };
};

const getChurnLabel = (pct) => {
  if (pct > 50) return 'High';
  if (pct > 20) return 'Medium';
  return 'Low';
};

const formatCurrency = (val) => {
  if (val == null) return '$0';
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.split(' ');
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Customer360ViewNew({ customerId, onClose, onEdit }) {
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [clv, setClv] = useState(null);
  const [predictive, setPredictive] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── Fetch all data on mount ── */
  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [custRes, clvRes, predRes, quotesRes] = await Promise.all([
          authFetch(`/api/customers/${customerId}`),
          authFetch(`/api/customers/${customerId}/lifetime-value`).catch(() => null),
          authFetch(`/api/customers/${customerId}/predictive-clv`).catch(() => null),
          authFetch(`/api/quotations?customer_id=${customerId}&limit=5`).catch(() => null),
        ]);

        if (cancelled) return;

        if (!custRes.ok) throw new Error('Customer not found');

        const custJson = await custRes.json();
        // GET /:id wraps in res.success → { data: { customer, quotes, stats } }
        const custData = custJson.data || custJson;
        setCustomer(custData.customer || custData);

        // Quotes from customer endpoint as fallback
        const custQuotes = custData.quotes || [];

        if (clvRes?.ok) {
          const clvJson = await clvRes.json();
          setClv(clvJson.data || clvJson);
        }

        if (predRes?.ok) {
          const predJson = await predRes.json();
          setPredictive(predJson.data || predJson);
        }

        if (quotesRes?.ok) {
          const qJson = await quotesRes.json();
          // GET /api/quotations returns { quotations: [...] } or { data: [...] }
          setQuotes(qJson.quotations || qJson.data || qJson.quotes || []);
        } else if (custQuotes.length > 0) {
          setQuotes(custQuotes);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [customerId]);

  /* ── Derived data ── */
  const name = customer?.name || '';
  const email = customer?.email || '';
  const initials = getInitials(name);

  const segment = predictive?.segment || clv?.segment || customer?.clv_segment || customer?.loyalty_tier || 'bronze';
  const segmentStyle = SEGMENT_COLORS[segment] || SEGMENT_COLORS.bronze;

  const lifetimeValue = clv?.metrics?.lifetimeValue || 0;
  const healthScore = predictive?.predicted?.activeProbability
    || (clv?.engagement?.churnRisk === 'low' ? 92 : clv?.engagement?.churnRisk === 'medium' ? 60 : 30)
    || 0;

  const churnProbability = predictive?.churn?.probability || 0;
  const churnColor = getChurnColor(churnProbability);
  const nextPurchaseProb = predictive?.nextPurchase?.probability30Days || 0;
  const predictedCLV = predictive?.predicted?.totalPredictedCLV || lifetimeValue || 0;

  const daysSinceLast = clv?.engagement?.daysSinceLastActivity || predictive?.historical?.daysSinceLast || 0;
  const avgDaysBetween = predictive?.historical?.avgDaysBetween || 0;

  const contactInfo = [
    { icon: Phone, label: 'Phone', value: customer?.phone || '—' },
    { icon: Building2, label: 'Company', value: customer?.company || 'Individual' },
    { icon: MapPin, label: 'Address', value: customer?.address || '—' },
    { icon: MapPin, label: 'City', value: [customer?.city, customer?.province].filter(Boolean).join(', ') || '—' },
  ];

  const predictiveInsights = [
    {
      label: 'Churn Risk',
      value: `${churnProbability}%`,
      sub: getChurnLabel(churnProbability),
      color: churnColor.color,
      bg: churnColor.bg,
    },
    {
      label: 'Next Purchase',
      value: `${nextPurchaseProb}%`,
      sub: nextPurchaseProb > 50 ? 'Likely' : 'Unlikely',
      color: '#3B82F6',
      bg: '#EFF6FF',
    },
    {
      label: 'Predicted CLV',
      value: formatCurrency(predictedCLV),
      sub: '',
      color: '#D97706',
      bg: '#FFFBEB',
    },
  ];

  /* ── Skeleton Loader ── */
  if (loading) {
    return (
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-screen w-[700px] bg-card rounded-l-2xl shadow-xl z-50 flex flex-col overflow-hidden"
      >
        <div className="relative shrink-0 px-6 pt-6 pb-5" style={{ background: 'linear-gradient(135deg, #1A1A2E, #16213E)' }}>
          <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors">
            <X size={20} />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/10 animate-pulse" />
            <div className="flex flex-col gap-2">
              <div className="h-5 w-40 bg-white/10 rounded animate-pulse" />
              <div className="h-3 w-32 bg-white/10 rounded animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-6 mt-4">
            <div className="h-8 w-16 bg-white/10 rounded animate-pulse" />
            <div className="h-8 w-20 bg-white/10 rounded animate-pulse" />
            <div className="h-8 w-16 bg-white/10 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      </motion.div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-screen w-[700px] bg-card rounded-l-2xl shadow-xl z-50 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <span className="text-foreground font-primary text-lg font-bold">Error</span>
          <button onClick={onClose}><X size={20} className="text-muted-foreground" /></button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <span className="text-destructive font-secondary text-sm">{error}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed right-0 top-0 h-screen w-[700px] bg-card rounded-l-2xl shadow-xl z-50 flex flex-col overflow-hidden"
    >
      {/* ── Dark Gradient Header ── */}
      <div
        className="relative shrink-0 px-6 pt-6 pb-5"
        style={{
          background: 'linear-gradient(135deg, #1A1A2E, #16213E)',
        }}
      >
        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors">
          <X size={20} />
        </button>

        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full border-2 border-white/30 bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-white font-primary text-xl font-bold">
              {initials}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-white font-primary text-lg font-bold">
              {name}
            </span>
            <span className="text-white/70 font-secondary text-sm">
              {email}
            </span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-white/50 font-secondary text-[10px] uppercase tracking-wide">
              Segment
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-secondary text-xs font-medium w-fit ${segmentStyle.bg} ${segmentStyle.text}`}>
              {segment.charAt(0).toUpperCase() + segment.slice(1)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-white/50 font-secondary text-[10px] uppercase tracking-wide">
              Lifetime Value
            </span>
            <span className="text-white font-primary text-base font-bold">
              {formatCurrency(lifetimeValue)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-white/50 font-secondary text-[10px] uppercase tracking-wide">
              Health Score
            </span>
            <span className="text-white font-primary text-base font-bold">
              {healthScore}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Contact Information */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex flex-col gap-3"
        >
          <span className="text-foreground font-primary text-sm font-semibold pb-3 border-b border-border/50">
            Contact Information
          </span>
          <div className="grid grid-cols-2 gap-3 bg-card rounded-xl border border-border p-4">
            {contactInfo.map((c) => (
              <div key={c.label} className="flex items-center gap-2.5">
                <c.icon size={16} className="text-muted-foreground shrink-0" />
                <div className="flex flex-col">
                  <span className="text-muted-foreground font-secondary text-[10px]">
                    {c.label}
                  </span>
                  <span className="text-foreground font-secondary text-sm">
                    {c.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Predictive Insights */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="flex flex-col gap-3"
        >
          <span className="text-foreground font-primary text-sm font-semibold pb-3 border-b border-border/50">
            Predictive Insights
          </span>
          <div className="grid grid-cols-3 gap-3">
            {predictiveInsights.map((ins) => (
              <div
                key={ins.label}
                className="flex flex-col gap-1 p-4 rounded-xl border border-border/50"
                style={{ backgroundColor: ins.bg }}
              >
                <span className="text-muted-foreground font-secondary text-[10px]">
                  {ins.label}
                </span>
                <span
                  className="font-primary text-xl font-bold"
                  style={{ color: ins.color }}
                >
                  {ins.value}
                </span>
                {ins.sub && (
                  <span
                    className="font-secondary text-[11px]"
                    style={{ color: ins.color }}
                  >
                    {ins.sub}
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Interval Bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="flex items-center justify-center py-3 px-4 bg-secondary/50 rounded-xl border border-border/50"
        >
          <span className="text-muted-foreground font-secondary text-xs">
            Avg Order Interval: <span className="text-foreground font-medium">{avgDaysBetween || '—'} days</span>
            {' · '}
            Last activity: <span className="text-foreground font-medium">{daysSinceLast ? `${daysSinceLast} days ago` : '—'}</span>
          </span>
        </motion.div>

        {/* Recent Quotes */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="flex flex-col gap-2.5"
        >
          <span className="text-foreground font-primary text-sm font-semibold pb-3 border-b border-border/50">
            Recent Quotes
          </span>
          <div className="flex flex-col gap-1.5">
            {quotes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <FileText size={32} className="text-muted-foreground/40" />
                <span className="text-foreground font-secondary text-sm font-medium">No quotes yet</span>
                <span className="text-muted-foreground font-secondary text-xs">Create a quote to get started</span>
              </div>
            )}
            {quotes.map((q) => {
              const qNumber = q.quotation_number || q.quote_number || `Q-${q.id}`;
              const total = q.total_amount != null
                ? formatCurrency(q.total_amount)
                : q.total_cents != null
                  ? formatCurrency(q.total_cents / 100)
                  : '$0';
              const status = q.status || 'Draft';
              const statusDisplay = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
              const sStyle = getStatusStyle(status) || getStatusStyle(statusDisplay);
              return (
                <div
                  key={q.id}
                  className="flex items-center justify-between py-2.5 px-3 bg-background border border-border rounded-xl hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-muted-foreground" />
                    <span className="text-foreground font-primary text-sm font-medium">
                      {qNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-primary text-sm font-semibold">
                      {total}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full font-secondary text-[11px] font-medium"
                      style={{
                        color: sStyle.color,
                        backgroundColor: sStyle.bg,
                      }}
                    >
                      {statusDisplay}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* ── Footer Actions ── */}
      <div className="flex items-center gap-3 px-6 py-4 border-t border-border shrink-0">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/quotes/new', { state: { customer } })}
          className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
        >
          <FileText size={16} />
          Create Quote
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            if (onEdit) onEdit(customerId);
          }}
          className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
        >
          Edit Customer
        </motion.button>
      </div>
    </motion.div>
  );
}
