/**
 * AutoInvoicePanelNew.jsx — Screen 73
 * TeleTime Design System · Auto-Invoice Configuration
 * Design frame: ymMvc
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2,
  Play,
  History,
} from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';

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
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function statusStyle(status) {
  if (status === 'sent' || status === 'paid') return { bg: 'rgba(34,197,94,0.08)', color: '#22C55E' };
  if (status === 'draft') return { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B' };
  return { bg: 'rgba(239,68,68,0.08)', color: '#EF4444' };
}

const invoiceCols = [
  { label: 'Invoice #',  w: 'flex-1' },
  { label: 'Trigger',    w: 'w-[100px]' },
  { label: 'Customer',   w: 'flex-1' },
  { label: 'Amount',     w: 'w-[100px]' },
  { label: 'Generated',  w: 'w-[140px]' },
  { label: 'Status',     w: 'w-[90px]' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AutoInvoicePanelNew() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, statsRes, recentRes] = await Promise.all([
        apiClient.get('/api/invoices/auto-invoice/settings'),
        apiClient.get('/api/invoices/auto-invoice/stats'),
        apiClient.get('/api/invoices/auto-invoice/recent'),
      ]);
      setSettings(settingsRes.data);
      setStats(statsRes.data);
      setRecent(recentRes.data || []);
    } catch (err) {
      toast.error('Failed to load auto-invoice data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Toggle a setting ── */
  const handleToggle = async (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    setSaving(true);
    try {
      await apiClient.put('/api/invoices/auto-invoice/settings', updated);
      toast.success('Setting updated');
    } catch (err) {
      setSettings(settings); // revert
      toast.error('Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  /* ── Run Now ── */
  const handleRunNow = async () => {
    try {
      await apiClient.post('/api/invoices/auto-invoice/trigger');
      toast.success('Auto-invoice triggered');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to trigger auto-invoice');
    }
  };

  /* ── Derived values ── */
  const successRate = stats && (stats.successfulCount + stats.failedCount) > 0
    ? ((stats.successfulCount / (stats.successfulCount + stats.failedCount)) * 100).toFixed(1)
    : '0';

  const kpis = [
    { label: 'Successful', value: stats ? String(stats.successfulCount) : '—', color: 'var(--foreground)' },
    { label: 'Total Value', value: stats ? formatCents(stats.totalInvoicedCents) : '—', color: 'var(--primary)' },
    { label: 'Failed', value: stats ? String(stats.failedCount) : '—', color: '#EF4444' },
    { label: 'Success Rate', value: stats ? `${successRate}%` : '—', color: '#22C55E' },
  ];

  const rules = settings ? [
    { title: 'Trigger on quote won', desc: 'Generate invoice when quote status changes to won', key: 'triggerOnQuoteWon', active: settings.triggerOnQuoteWon },
    { title: 'Trigger on order created', desc: 'Generate invoice when a new order is created', key: 'triggerOnOrderCreated', active: settings.triggerOnOrderCreated },
    { title: 'Trigger on order shipped', desc: 'Generate invoice when order status changes to shipped', key: 'triggerOnOrderShipped', active: settings.triggerOnOrderShipped },
    { title: 'Auto-send to customer email', desc: 'Automatically send generated invoice to customer email', key: 'autoSendEmail', active: settings.autoSendEmail },
    { title: 'Include payment link', desc: 'Add online payment link to generated invoices', key: 'includePaymentLink', active: settings.includePaymentLink },
  ] : [];

  const scheduleItems = settings ? [
    { label: 'Payment Terms', value: `Net ${settings.defaultPaymentTermsDays}` },
    { label: 'Notify on Generation', value: settings.notifyOnGeneration ? 'Yes' : 'No' },
    { label: 'Status', value: settings.enabled ? 'Active' : 'Disabled' },
  ] : [];

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Invoices', 'Auto-Invoice']}
        rightContent={
          <div className="flex items-center gap-2.5">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('View history coming soon')}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
            >
              <History size={16} />
              View History
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleRunNow}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
            >
              <Play size={16} />
              Run Now
            </motion.button>
          </div>
        }
      />

      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && settings && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-foreground font-primary text-[22px] font-bold">Auto-Invoice Configuration</h1>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: settings.enabled ? 'rgba(34,197,94,0.08)' : 'rgba(100,116,139,0.08)' }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: settings.enabled ? '#22C55E' : '#64748B' }} />
                  <span className="font-secondary text-xs font-semibold" style={{ color: settings.enabled ? '#22C55E' : '#64748B' }}>
                    {settings.enabled ? 'Active' : 'Disabled'}
                  </span>
                </span>
              </div>
              {settings.updated_at && (
                <span className="text-muted-foreground font-secondary text-[13px]">
                  Last updated: {formatDate(settings.updated_at)}
                </span>
              )}
            </div>

            {/* KPI Row */}
            <div className="flex gap-4">
              {kpis.map((kpi, i) => (
                <motion.div
                  key={kpi.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className="flex-1 flex flex-col gap-1 bg-card rounded-xl border border-border px-5 py-4"
                >
                  <span className="text-muted-foreground font-secondary text-xs">{kpi.label}</span>
                  <span className="font-primary text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</span>
                </motion.div>
              ))}
            </div>

            {/* Mid Row */}
            <div className="flex gap-4">
              {/* Automation Rules */}
              <div className="flex-1 flex flex-col bg-card rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-foreground font-secondary text-[15px] font-semibold">Automation Rules</span>
                  {saving && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                </div>
                <div className="flex flex-col">
                  {rules.map((rule, i) => (
                    <div
                      key={rule.key}
                      className="flex items-center justify-between px-5 py-3.5"
                      style={i < rules.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-foreground font-secondary text-[13px] font-medium">{rule.title}</span>
                        <span className="text-muted-foreground font-secondary text-[11px]">{rule.desc}</span>
                      </div>
                      <div className="w-[50px] shrink-0 flex justify-end">
                        <button
                          onClick={() => handleToggle(rule.key)}
                          className="w-8 h-5 rounded-full relative cursor-pointer transition-colors"
                          style={{ backgroundColor: rule.active ? 'var(--primary)' : 'var(--border)' }}
                        >
                          <div
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all"
                            style={{ right: rule.active ? '2px' : 'auto', left: rule.active ? 'auto' : '2px' }}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Schedule / Settings */}
              <div className="flex flex-col w-[400px] bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-foreground font-secondary text-[15px] font-semibold">Settings</span>
                </div>
                <div className="flex flex-col gap-4 px-5 py-4">
                  {scheduleItems.map((item) => (
                    <div key={item.label} className="flex flex-col gap-1">
                      <span className="text-muted-foreground font-secondary text-[11px]">{item.label}</span>
                      <span className="text-foreground font-secondary text-sm font-medium">{item.value}</span>
                    </div>
                  ))}
                  {stats && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground font-secondary text-[11px]">Quote Triggered</span>
                        <span className="text-foreground font-secondary text-sm font-medium">{stats.quoteTriggeredCount}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground font-secondary text-[11px]">Order Triggered</span>
                        <span className="text-foreground font-secondary text-sm font-medium">{stats.orderTriggeredCount}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Auto-Generated Invoices */}
            <h2 className="text-foreground font-secondary text-base font-semibold">Recent Auto-Generated Invoices</h2>

            <div className="flex flex-col bg-card rounded-xl border border-border overflow-hidden">
              {/* Header */}
              <div className="flex items-center px-4 py-2.5 bg-secondary" style={{ borderBottom: '1px solid var(--border)' }}>
                {invoiceCols.map((col) => (
                  <span key={col.label} className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[10px] font-semibold uppercase`}>
                    {col.label}
                  </span>
                ))}
              </div>

              {/* Empty */}
              {recent.length === 0 && (
                <div className="flex items-center justify-center py-12">
                  <span className="text-muted-foreground font-secondary text-sm">No recent auto-generated invoices</span>
                </div>
              )}

              {/* Rows */}
              {recent.map((inv, i) => {
                const failed = !!inv.error_message;
                const style = failed
                  ? { bg: 'rgba(239,68,68,0.08)', color: '#EF4444' }
                  : statusStyle(inv.invoice_status);
                return (
                  <div
                    key={inv.id}
                    className="flex items-center px-4 py-2.5"
                    style={i < recent.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
                  >
                    <span className="flex-1 shrink-0 text-primary font-primary text-[11px] font-semibold">
                      {inv.invoice_number || '—'}
                    </span>
                    <span className="w-[100px] shrink-0 text-muted-foreground font-secondary text-[11px]">
                      {inv.trigger_type?.replace(/_/g, ' ') || '—'}
                    </span>
                    <span className="flex-1 shrink-0 text-foreground font-secondary text-xs">
                      {inv.customer_name || '—'}
                    </span>
                    <span className="w-[100px] shrink-0 text-foreground font-primary text-xs font-medium">
                      {inv.total_cents ? formatCents(inv.total_cents) : '—'}
                    </span>
                    <span className="w-[140px] shrink-0 text-muted-foreground font-secondary text-[11px]">
                      {formatDate(inv.created_at)}
                    </span>
                    <div className="w-[90px] shrink-0">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full font-secondary text-[10px] font-medium"
                        style={{ backgroundColor: style.bg, color: style.color }}
                      >
                        {failed ? 'Failed' : (inv.invoice_status || '—')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
