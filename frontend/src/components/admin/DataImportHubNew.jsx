/**
 * DataImportHubNew.jsx — Screen 41
 * TeleTime Design System · Admin — Data Import Hub
 * Design frame: JPUGO
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Download } from 'lucide-react';
// import AdminSidebar from '../shared/AdminSidebar'; // removed — MainLayout provides sidebar

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const tabs = ['Skulytics Import', 'CE Import', 'Sync Health'];

const statCards = [
  { label: 'Total SKUs', value: '4,892', color: 'text-foreground' },
  { label: 'Stale SKUs', value: '156', color: 'text-[#F59E0B]' },
  { label: 'Discontinued', value: '23', color: 'text-destructive' },
  { label: 'Overdue Sync', value: '8', color: 'text-primary' },
];

const syncCols = [
  { label: 'Type', w: 'w-[120px]' },
  { label: 'Status', w: 'w-[100px]' },
  { label: 'Processed', w: 'w-[80px]' },
  { label: 'Failed', w: 'w-[60px]' },
  { label: 'Duration', w: 'w-[80px]' },
  { label: 'Started', w: 'flex-1' },
];

const syncRows = [
  {
    type: 'Incremental',
    typeBg: '#DBEAFE',
    typeColor: '#2563EB',
    status: 'Completed',
    statusBg: '#D1FAE5',
    statusColor: '#059669',
    processed: '342',
    failed: '0',
    failedColor: 'text-muted-foreground',
    duration: '2m 14s',
    started: '10:34 AM',
  },
  {
    type: 'Full',
    typeBg: '#FEF3C7',
    typeColor: '#D97706',
    status: 'Completed',
    statusBg: '#D1FAE5',
    statusColor: '#059669',
    processed: '4,892',
    failed: '3',
    failedColor: 'text-destructive',
    duration: '18m 42s',
    started: 'Yesterday',
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DataImportHubNew() {
  const [activeTab, setActiveTab] = useState('Skulytics Import');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-primary text-[22px] font-bold">
              Data Import Hub
            </h1>
            <p className="text-muted-foreground font-secondary text-[13px]">
              Import and sync product data from external sources
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
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
                <span className={`font-primary text-2xl font-bold ${stat.color}`}>
                  {stat.value}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Sync Panel */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.3 }}
            className="flex items-center justify-between bg-card border border-border rounded-lg p-4"
          >
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-secondary text-[11px]">
                Last Sync
              </span>
              <span className="text-foreground font-primary text-sm font-semibold">
                Feb 28, 2026 at 10:34 AM
              </span>
              <span className="text-muted-foreground font-secondary text-[11px]">
                42 minutes ago
              </span>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-secondary text-secondary-foreground font-primary text-sm font-medium"
              >
                <RefreshCw size={16} />
                Incremental Sync
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
              >
                <Download size={16} />
                Full Sync
              </motion.button>
            </div>
          </motion.div>

          {/* Recent Syncs Table */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
            className="flex flex-col bg-card border border-border rounded-lg overflow-hidden"
          >
            {/* Title */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-foreground font-primary text-[13px] font-semibold">
                Recent Syncs
              </span>
            </div>

            {/* Column headers */}
            <div
              className="flex items-center px-4 py-2 bg-secondary"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              {syncCols.map((col) => (
                <span
                  key={col.label}
                  className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold`}
                >
                  {col.label}
                </span>
              ))}
            </div>

            {/* Rows */}
            {syncRows.map((row) => (
              <div
                key={row.type}
                className="flex items-center px-4 py-2.5"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                {/* Type badge */}
                <div className="w-[120px] shrink-0">
                  <span
                    className="inline-flex items-center px-2 py-[2px] rounded font-primary text-[10px] font-semibold"
                    style={{ backgroundColor: row.typeBg, color: row.typeColor }}
                  >
                    {row.type}
                  </span>
                </div>

                {/* Status badge */}
                <div className="w-[100px] shrink-0">
                  <span
                    className="inline-flex items-center px-2 py-[2px] rounded font-primary text-[10px] font-semibold"
                    style={{ backgroundColor: row.statusBg, color: row.statusColor }}
                  >
                    {row.status}
                  </span>
                </div>

                <span className="w-[80px] shrink-0 text-foreground font-secondary text-[12px]">
                  {row.processed}
                </span>
                <span className={`w-[60px] shrink-0 font-secondary text-[12px] ${row.failedColor}`}>
                  {row.failed}
                </span>
                <span className="w-[80px] shrink-0 text-foreground font-secondary text-[12px]">
                  {row.duration}
                </span>
                <span className="flex-1 shrink-0 text-muted-foreground font-secondary text-[12px]">
                  {row.started}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
  );
}
