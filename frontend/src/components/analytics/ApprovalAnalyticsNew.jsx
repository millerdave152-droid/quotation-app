/**
 * ApprovalAnalyticsNew.jsx — Screen 49
 * TeleTime Design System · Approval Analytics
 * Design frame: ErqtF
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const periods = ['7 Days', '30 Days', '90 Days'];

const kpis = [
  { label: 'Total Approvals', value: '247', delta: '+12% vs last week', up: true },
  { label: 'Approval Rate', value: '89.2%', delta: '+3.1% vs last week', up: true },
  { label: 'Avg Response Time', value: '4.2 min', delta: '-1.3 min vs last week', up: true },
  { label: 'Rejected Requests', value: '30', delta: '10.8% rejection rate', up: false, highlighted: true },
];

const approvalTypes = [
  { label: 'Discount Override', color: 'var(--primary)', count: '89', rate: '92%', rateColor: '#22C55E' },
  { label: 'Price Override', color: '#3B82F6', count: '62', rate: '85%', rateColor: '#22C55E' },
  { label: 'Void / Refund', color: '#8B5CF6', count: '45', rate: '78%', rateColor: '#F59E0B' },
  { label: 'No-Sale Open', color: '#22C55E', count: '32', rate: '94%', rateColor: '#22C55E' },
  { label: 'Cash Drop Override', color: '#EF4444', count: '19', rate: '100%', rateColor: '#22C55E' },
];

const managers = [
  { name: 'Jane Wilson', bg: 'bg-primary', initials: 'JW', approved: '104', rejected: '8', avgTime: '3.2m', rate: '93%', rateLevel: 'green' },
  { name: 'Robert Lee', bg: 'bg-[#3B82F6]', initials: 'RL', approved: '78', rejected: '12', avgTime: '5.1m', rate: '87%', rateLevel: 'amber' },
  { name: 'Karen Park', bg: 'bg-[#8B5CF6]', initials: 'KP', approved: '42', rejected: '6', avgTime: '4.8m', rate: '88%', rateLevel: 'amber' },
  { name: 'Tom Nguyen', bg: 'bg-[#F59E0B]', initials: 'TN', approved: '23', rejected: '4', avgTime: '6.7m', avgTimeColor: '#F59E0B', rate: '85%', rateLevel: 'amber' },
];

const mgrCols = [
  { label: 'Manager', w: 'flex-1' },
  { label: 'Approved', w: 'w-[70px]', align: 'text-right' },
  { label: 'Rejected', w: 'w-[70px]', align: 'text-right' },
  { label: 'Avg Time', w: 'w-[70px]', align: 'text-right' },
  { label: 'Rate', w: 'w-[60px]', align: 'text-right' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rateBadgeStyle(level) {
  if (level === 'green') return { bg: '#22C55E15', color: '#22C55E' };
  return { bg: '#F59E0B15', color: '#F59E0B' };
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PeriodSelector({ active, onChange }) {
  return (
    <div className="flex bg-secondary rounded-lg p-[3px]">
      {periods.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 rounded-md font-secondary text-[12px] transition-all ${
            active === p
              ? 'bg-background shadow font-semibold text-foreground'
              : 'text-muted-foreground font-medium'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function ExportButton() {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
    >
      <Download size={14} />
      Export
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ApprovalAnalyticsNew() {
  const [period, setPeriod] = useState('7 Days');

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['POS Reports', 'Approval Analytics']}
        rightContent={
          <>
            <PeriodSelector active={period} onChange={setPeriod} />
            <ExportButton />
          </>
        }
      />

      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className={`flex flex-col gap-1 bg-card rounded-xl p-4 ${
                k.highlighted
                  ? 'border-2 border-[#EF444440]'
                  : 'border border-border'
              }`}
            >
              <span className="text-muted-foreground font-secondary text-xs font-medium">
                {k.label}
              </span>
              <span
                className={`font-primary text-[24px] font-bold ${
                  k.up ? 'text-foreground' : 'text-[#EF4444]'
                }`}
              >
                {k.value}
              </span>
              <span
                className={`font-secondary text-[11px] ${
                  k.up ? 'text-[#22C55E]' : 'text-[#EF4444]'
                }`}
              >
                {k.delta}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Mid row */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Approval by Type */}
          <div className="w-[420px] shrink-0 flex flex-col bg-card rounded-xl border border-border overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-foreground font-secondary text-[15px] font-semibold">
                Approval by Type
              </span>
              <span className="text-muted-foreground font-secondary text-xs">
                Last 7 days
              </span>
            </div>

            <div className="flex flex-col gap-0 px-5 py-3">
              {approvalTypes.map((t) => (
                <div
                  key={t.label}
                  className="flex items-center justify-between py-2.5"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-[5px] shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="text-foreground font-secondary text-[13px] font-medium">
                      {t.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-primary text-[13px] font-semibold">
                      {t.count}
                    </span>
                    <span className="font-secondary text-xs font-semibold" style={{ color: t.rateColor }}>
                      {t.rate}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Manager Performance */}
          <div className="flex-1 flex flex-col bg-card rounded-xl border border-border overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-foreground font-secondary text-[15px] font-semibold">
                Manager Performance
              </span>
              <span className="text-muted-foreground font-secondary text-xs">
                Approval metrics
              </span>
            </div>

            {/* Column headers */}
            <div className="flex items-center px-5 py-2.5 bg-secondary">
              {mgrCols.map((col) => (
                <span
                  key={col.label}
                  className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold ${col.align || ''}`}
                >
                  {col.label}
                </span>
              ))}
            </div>

            {/* Rows */}
            {managers.map((m, i) => {
              const badge = rateBadgeStyle(m.rateLevel);
              return (
                <div
                  key={m.name}
                  className="flex items-center px-5 py-2.5"
                  style={i < managers.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
                >
                  {/* Manager name + avatar */}
                  <div className="flex-1 flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full ${m.bg} flex items-center justify-center shrink-0`}
                    >
                      <span className="text-white font-secondary text-[10px] font-bold">
                        {m.initials}
                      </span>
                    </div>
                    <span className="text-foreground font-secondary text-[13px] font-medium">
                      {m.name}
                    </span>
                  </div>

                  {/* Approved */}
                  <span className="w-[70px] shrink-0 text-foreground font-primary text-[13px] font-semibold text-right">
                    {m.approved}
                  </span>

                  {/* Rejected */}
                  <span className="w-[70px] shrink-0 text-foreground font-primary text-[13px] text-right">
                    {m.rejected}
                  </span>

                  {/* Avg Time */}
                  <span
                    className="w-[70px] shrink-0 font-primary text-[13px] text-right"
                    style={{ color: m.avgTimeColor || 'var(--foreground)' }}
                  >
                    {m.avgTime}
                  </span>

                  {/* Rate badge */}
                  <div className="w-[60px] shrink-0 flex justify-end">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full font-secondary text-[11px] font-semibold"
                      style={{ backgroundColor: badge.bg, color: badge.color }}
                    >
                      {m.rate}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
