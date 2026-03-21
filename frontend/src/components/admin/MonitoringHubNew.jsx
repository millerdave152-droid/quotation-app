/**
 * MonitoringHubNew.jsx — Screen 36
 * TeleTime Design System · Admin — Monitoring Hub
 * Design frame: USp9R
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
// import AdminSidebar from '../shared/AdminSidebar'; // removed — MainLayout provides sidebar

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const tabs = ['Client Errors', 'Discount Analytics'];

const statCards = [
  { label: 'Total Errors (7d)', value: '234', color: 'text-destructive' },
  { label: 'Affected Users', value: '18', color: 'text-foreground' },
  { label: 'Open Groups', value: '12', color: 'text-primary' },
];

const severityRows = [
  { label: 'Fatal', count: '3', dot: 'bg-[#DC2626]' },
  { label: 'Error', count: '89', dot: 'bg-primary' },
  { label: 'Warning', count: '112', dot: 'bg-[#F59E0B]' },
  { label: 'Info', count: '30', dot: 'bg-[#3B82F6]' },
];

const typeRows = [
  { label: 'Runtime', count: '98', dot: 'bg-[#8B5CF6]' },
  { label: 'Render', count: '56', dot: 'bg-[#EC4899]' },
  { label: 'Network', count: '62', dot: 'bg-[#06B6D4]' },
  { label: 'Unhandled', count: '18', dot: 'bg-[#6B7280]' },
];

const errorColumns = [
  { label: 'Message', w: 'flex-1' },
  { label: 'Severity', w: 'w-[80px]' },
  { label: 'Count', w: 'w-[60px]' },
  { label: 'Users', w: 'w-[50px]' },
];

const topErrors = [
  {
    message: "Cannot read property 'price' of undefined",
    severity: 'error',
    severityBg: '#FEE2E2',
    severityColor: '#DC2626',
    count: '47',
    users: '8',
  },
  {
    message: 'Network error: Failed to fetch /api/products',
    severity: 'warning',
    severityBg: '#FEF3C7',
    severityColor: '#D97706',
    count: '32',
    users: '12',
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function BreakdownCard({ title, rows }) {
  return (
    <div className="flex flex-col bg-card border border-border rounded-lg p-4 gap-2.5">
      <span className="text-foreground font-primary text-[13px] font-semibold">
        {title}
      </span>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${row.dot}`} />
            <span className="text-foreground font-secondary text-[12px]">
              {row.label}
            </span>
          </div>
          <span className="text-foreground font-primary text-[12px] font-semibold">
            {row.count}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MonitoringHubNew() {
  const [activeTab, setActiveTab] = useState('Client Errors');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-primary text-[22px] font-bold">
              Monitoring Hub
            </h1>
            <p className="text-muted-foreground font-secondary text-[13px]">
              Client errors and discount analytics
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex items-center gap-1 px-6 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center px-3 py-1.5 rounded-lu-pill font-secondary text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-background text-foreground shadow-lu-sm border border-border'
                  : 'text-muted-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            {statCards.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className="flex flex-col gap-1 bg-card border border-border rounded-lg p-4"
              >
                <span className="text-muted-foreground font-secondary text-[11px]">
                  {stat.label}
                </span>
                <span
                  className={`font-primary text-2xl font-bold ${stat.color}`}
                >
                  {stat.value}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Breakdown Row */}
          <div className="grid grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
            >
              <BreakdownCard title="By Severity" rows={severityRows} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <BreakdownCard title="By Type" rows={typeRows} />
            </motion.div>
          </div>

          {/* Top Errors Table */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
            className="flex flex-col bg-card border border-border rounded-lg overflow-hidden"
          >
            {/* Table title */}
            <div
              className="px-4 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-foreground font-primary text-[13px] font-semibold">
                Top Errors (7d)
              </span>
            </div>

            {/* Column headers */}
            <div
              className="flex items-center px-4 py-2 bg-secondary"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              {errorColumns.map((col) => (
                <span
                  key={col.label}
                  className={`${col.w} shrink-0 text-muted-foreground font-primary text-[11px] font-semibold`}
                >
                  {col.label}
                </span>
              ))}
            </div>

            {/* Rows */}
            {topErrors.map((row) => (
              <div
                key={row.message}
                className="flex items-center px-4 py-2.5"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="flex-1 shrink-0 text-foreground font-secondary text-[12px]">
                  {row.message}
                </span>
                <div className="w-[80px] shrink-0">
                  <span
                    className="inline-flex items-center px-1.5 py-[2px] rounded font-primary text-[10px] font-semibold"
                    style={{
                      backgroundColor: row.severityBg,
                      color: row.severityColor,
                    }}
                  >
                    {row.severity}
                  </span>
                </div>
                <span className="w-[60px] shrink-0 text-foreground font-primary text-[12px] font-semibold">
                  {row.count}
                </span>
                <span className="w-[50px] shrink-0 text-muted-foreground font-secondary text-[12px]">
                  {row.users}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
  );
}
