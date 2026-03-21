/**
 * ARDashboardNew.jsx — Screen 72
 * TeleTime Design System · Accounts Receivable Dashboard
 * Design frame: PGipz
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Bell,
  Eye,
  DollarSign,
} from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDollars(val) {
  if (val == null) return '—';
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function riskLevel(customer) {
  if (customer.days_over_90 > 0) return 'high';
  if (customer.days_61_90 > 0 || customer.days_31_60 > 0) return 'medium';
  return 'low';
}

const riskBadges = {
  low:    { label: 'Low',    className: 'text-emerald-600 bg-emerald-500/10' },
  medium: { label: 'Medium', className: 'text-amber-600 bg-amber-500/10' },
  high:   { label: 'High',   className: 'text-red-600 bg-red-500/10' },
};

const BUCKET_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444'];

const cols = [
  { label: 'Customer',   w: 'flex-1' },
  { label: 'Total Owed', w: 'w-[110px]' },
  { label: 'Current',    w: 'w-[100px]' },
  { label: '31-60 Days', w: 'w-[100px]' },
  { label: '61-90 Days', w: 'w-[100px]' },
  { label: '90+ Days',   w: 'w-[90px]' },
  { label: 'Risk',       w: 'w-[80px]' },
  { label: '',           w: 'w-[60px]' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ARDashboardNew() {
  const toast = useToast();
  const [aging, setAging] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAging = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/invoices/ar-aging');
      setAging(res.data);
    } catch (err) {
      toast.error('Failed to load aging report');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAging(); }, [fetchAging]);

  const summary = aging?.summary;
  const buckets = aging?.aging_buckets || [];
  const customers = aging?.customers || [];

  /* ── KPI cards ── */
  const kpis = [
    { label: 'Total Receivable',    value: summary ? formatDollars(summary.total_outstanding) : '—', valueColor: 'text-foreground', accent: 'border-t-primary' },
    { label: 'Current (0-30 days)', value: summary ? formatDollars(summary.current) : '—',           valueColor: 'text-emerald-600', accent: 'border-t-emerald-500' },
    { label: 'Overdue (31-60)',     value: summary ? formatDollars(summary.days_31_60) : '—',        valueColor: 'text-primary', accent: 'border-t-amber-500' },
    { label: 'Critical (60+)',      value: summary ? formatDollars((summary.days_61_90 || 0) + (summary.days_over_90 || 0)) : '—', valueColor: 'text-red-600', accent: 'border-t-red-500' },
    { label: 'Customers',           value: summary ? String(summary.customer_count) : '—',           valueColor: 'text-foreground', accent: 'border-t-blue-500' },
  ];

  /* ── Send reminders ── */
  const handleSendReminders = async () => {
    try {
      await apiClient.post('/api/invoices/ar-aging/reminders');
      toast.success('Payment reminders sent');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reminders');
    }
  };

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.2}} className="flex-1 flex flex-col overflow-hidden">
      <BreadcrumbTopBar
        title={['Invoices', 'Accounts Receivable']}
        rightContent={
          <div className="flex items-center gap-2.5">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('Export coming soon')}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-background border border-border text-foreground font-secondary text-sm font-medium shadow-sm hover:shadow transition"
            >
              <Download size={16} />
              Export Report
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSendReminders}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-secondary text-sm font-semibold shadow-sm hover:shadow transition"
            >
              <Bell size={16} />
              Send Reminders
            </motion.button>
          </div>
        }
      />

      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Title */}
        <h1 className="text-foreground font-primary text-2xl font-semibold tracking-tight">Accounts Receivable Dashboard</h1>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col gap-5">
            <div className="flex gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col gap-2 bg-card rounded-xl border border-border px-5 py-4">
                  <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                  <div className="h-8 w-24 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              <div className="flex-1 h-[240px] bg-card rounded-xl border border-border animate-pulse" />
              <div className="w-[380px] h-[240px] bg-card rounded-xl border border-border animate-pulse" />
            </div>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center h-12 px-4 gap-4 border-b border-border/50">
                  <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[110px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[100px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[100px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[100px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[90px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[80px] h-4 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && (
          <>
            {/* KPI Row */}
            <div className="flex gap-4">
              {kpis.map((kpi, i) => (
                <motion.div
                  key={kpi.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className={`flex-1 flex flex-col gap-1 bg-gradient-to-br from-card to-card/50 rounded-xl border border-border ${kpi.accent} border-t-2 px-5 py-4 shadow-sm hover:shadow-md transition-shadow`}
                >
                  <span className="text-muted-foreground font-secondary text-xs font-medium">{kpi.label}</span>
                  <span className={`font-primary text-3xl font-bold tracking-tight ${kpi.valueColor}`}>{kpi.value}</span>
                </motion.div>
              ))}
            </div>

            {/* Mid Row */}
            <div className="flex gap-4">
              {/* Aging Breakdown Chart */}
              <div className="flex-1 flex flex-col bg-card rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                  <span className="text-foreground font-secondary text-[15px] font-semibold">Aging Breakdown</span>
                  <span className="text-muted-foreground font-secondary text-xs">
                    {aging?.as_of_date ? `As of ${new Date(aging.as_of_date).toLocaleDateString()}` : ''}
                  </span>
                </div>
                <div className="flex items-end gap-4 px-6 py-6" style={{ minHeight: 180 }}>
                  {buckets.map((b, i) => (
                    <div key={b.bucket} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-foreground font-primary text-[11px] font-semibold">{b.percentage}%</span>
                      <div className="w-full flex justify-center">
                        <div
                          className="w-10 rounded-t"
                          style={{
                            height: `${Math.max(b.percentage * 1.4, 8)}px`,
                            backgroundColor: BUCKET_COLORS[i] || '#64748B',
                          }}
                        />
                      </div>
                      <span className="text-muted-foreground font-secondary text-[9px] text-center leading-tight">{b.bucket}</span>
                      <span className="text-foreground font-primary text-[10px] font-medium">{formatDollars(b.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Collection Summary */}
              <div className="flex flex-col w-[380px] bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50">
                  <span className="text-foreground font-secondary text-[15px] font-semibold">Collection Summary</span>
                </div>
                <div className="flex flex-col gap-4 px-5 py-4">
                  {buckets.map((b, i) => (
                    <div key={b.bucket} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground font-secondary text-xs">{b.bucket}</span>
                        <span className="text-foreground font-primary text-sm font-bold">{formatDollars(b.amount)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${b.percentage}%`, backgroundColor: BUCKET_COLORS[i] || '#64748B' }}
                        />
                      </div>
                      <span className="text-muted-foreground font-secondary text-[10px]">{b.count} customers</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Customer Table */}
            <div className="flex flex-col bg-card rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-foreground font-secondary text-[15px] font-semibold">By Customer</span>
                <span className="text-muted-foreground font-secondary text-xs">{customers.length} customers</span>
              </div>

              {/* Header */}
              <div className="flex items-center px-4 py-2.5 bg-muted/50 border-b border-border/50">
                {cols.map((col) => (
                  <span key={col.label || 'action'} className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[10px] font-semibold uppercase tracking-wider`}>
                    {col.label}
                  </span>
                ))}
              </div>

              {/* Empty */}
              {customers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <DollarSign size={48} className="text-muted-foreground/30" />
                  <h3 className="font-secondary text-lg font-semibold text-foreground">No outstanding receivables</h3>
                  <p className="font-secondary text-sm text-muted-foreground">All accounts are settled</p>
                </div>
              )}

              {/* Rows */}
              {customers.map((row, i) => {
                const risk = riskLevel(row);
                const badge = riskBadges[risk];
                return (
                  <motion.div
                    key={row.customer_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className={`group flex items-center px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${risk === 'high' ? 'bg-red-500/5' : ''}`}
                  >
                    <div className="flex-1 shrink-0 flex flex-col">
                      <span className="text-foreground font-secondary text-[13px] font-medium">{row.customer_name}</span>
                      {row.email && <span className="text-muted-foreground font-secondary text-[10px]">{row.email}</span>}
                    </div>
                    <span className="w-[110px] shrink-0 text-foreground font-primary text-[13px] font-semibold">{formatDollars(row.total_outstanding)}</span>
                    <span className="w-[100px] shrink-0 font-primary text-[13px] text-emerald-600">{formatDollars(row.current)}</span>
                    <span className="w-[100px] shrink-0 font-primary text-[13px] text-primary">{row.days_31_60 > 0 ? formatDollars(row.days_31_60) : '—'}</span>
                    <span className="w-[100px] shrink-0 font-primary text-[13px] text-amber-600">{row.days_61_90 > 0 ? formatDollars(row.days_61_90) : '—'}</span>
                    <span className="w-[90px] shrink-0 font-primary text-[13px] text-red-600">{row.days_over_90 > 0 ? formatDollars(row.days_over_90) : '—'}</span>
                    <div className="w-[80px] shrink-0">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-secondary text-[10px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="w-[60px] shrink-0 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => toast.info(`View details for ${row.customer_name}`)}
                        className="p-1.5 rounded-md hover:bg-primary/10 transition-colors"
                      >
                        <Eye size={14} className="text-primary" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
