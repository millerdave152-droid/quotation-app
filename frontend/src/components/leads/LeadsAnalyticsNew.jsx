/**
 * LeadsAnalyticsNew.jsx — Screen 19
 * TeleTime Design System · Leads Analytics Dashboard
 * Design frame: OJAq2
 */

import { motion } from 'framer-motion';
import LunarisSidebar from '../shared/LunarisSidebar';

/* ------------------------------------------------------------------ */
/*  KPI Data                                                           */
/* ------------------------------------------------------------------ */

const kpiCards = [
  {
    label: 'Conversion Rate',
    value: '23.4%',
    sub: '+2.1% from last month',
    subColor: '#16A34A',
  },
  {
    label: 'Avg. Response Time',
    value: '2.4 hrs',
    sub: '-0.8 hrs improvement',
    subColor: '#16A34A',
  },
  {
    label: 'Avg. Lead Score',
    value: '64',
    sub: 'Grade B average',
    subColor: '#3B82F6',
  },
  {
    label: 'Pipeline Value',
    value: '$342K',
    sub: '+$48K this week',
    subColor: '#16A34A',
  },
];

/* ------------------------------------------------------------------ */
/*  Pipeline Bar Data                                                  */
/* ------------------------------------------------------------------ */

const pipelineBars = [
  { label: 'New', count: 28, pct: 62, color: 'bg-primary' },
  { label: 'Contacted', count: 45, pct: 100, color: 'bg-[#16A34A]' },
  { label: 'Qualified', count: 32, pct: 71, color: 'bg-[#3B82F6]' },
  { label: 'Converted', count: 20, pct: 44, color: 'bg-[#8B5CF6]' },
  { label: 'Lost', count: 17, pct: 38, color: 'bg-[#EF4444]' },
];

/* ------------------------------------------------------------------ */
/*  Source Data                                                        */
/* ------------------------------------------------------------------ */

const sourceList = [
  { label: 'Walk-in', value: '38 (27%)', dotColor: 'bg-primary' },
  { label: 'Phone', value: '32 (23%)', dotColor: 'bg-[#3B82F6]' },
  { label: 'Website', value: '28 (20%)', dotColor: 'bg-[#16A34A]' },
  { label: 'Referral', value: '24 (17%)', dotColor: 'bg-[#8B5CF6]' },
  { label: 'Realtor/Builder', value: '12 (8%)', dotColor: 'bg-[#D97706]' },
  { label: 'Other', value: '8 (5%)', dotColor: 'bg-muted-foreground' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LeadsAnalyticsNew() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <LunarisSidebar activeItem="Leads & Inquiries" />

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-foreground font-primary text-[22px] font-bold">
              Lead Analytics
            </h1>
            <p className="text-muted-foreground font-secondary text-[13px]">
              Track lead pipeline performance
            </p>
          </div>

          {/* Analytics / View Leads Toggle */}
          <div className="flex items-center gap-2 bg-secondary rounded-lu-pill p-1 h-10">
            <span className="px-3 py-1.5 rounded-lu-pill bg-background text-foreground font-secondary text-sm font-medium shadow-lu-sm">
              Analytics
            </span>
            <span className="px-3 py-1.5 rounded-lu-pill text-muted-foreground font-secondary text-sm font-medium cursor-pointer">
              View Leads
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
          {/* KPI Row */}
          <div className="grid grid-cols-4 gap-4">
            {kpiCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="flex flex-col gap-1 p-4 bg-card border border-border rounded-lg"
              >
                <span className="text-muted-foreground font-secondary text-[11px]">
                  {card.label}
                </span>
                <span className="text-foreground font-primary text-2xl font-bold">
                  {card.value}
                </span>
                <span
                  className="font-secondary text-[11px]"
                  style={{ color: card.subColor }}
                >
                  {card.sub}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Lead Pipeline by Status */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className="flex-1 flex flex-col gap-3 p-4 bg-card border border-border rounded-lg"
            >
              <span className="text-foreground font-primary text-sm font-semibold">
                Lead Pipeline by Status
              </span>

              <div className="flex-1 flex flex-col gap-2.5 justify-center">
                {pipelineBars.map((bar) => (
                  <div
                    key={bar.label}
                    className="flex items-center gap-2.5"
                  >
                    <span className="w-[70px] text-foreground font-secondary text-xs shrink-0">
                      {bar.label}
                    </span>
                    <div className="flex-1 h-5 bg-secondary rounded">
                      <div
                        className={`h-full rounded ${bar.color}`}
                        style={{ width: `${bar.pct}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground font-primary text-xs font-semibold w-6 text-right shrink-0">
                      {bar.count}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Leads by Source */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="w-[340px] shrink-0 flex flex-col gap-3 p-4 bg-card border border-border rounded-lg"
            >
              <span className="text-foreground font-primary text-sm font-semibold">
                Leads by Source
              </span>

              <div className="flex flex-col gap-2">
                {sourceList.map((src) => (
                  <div
                    key={src.label}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${src.dotColor}`}
                      />
                      <span className="text-foreground font-secondary text-xs">
                        {src.label}
                      </span>
                    </div>
                    <span className="text-muted-foreground font-primary text-xs font-semibold">
                      {src.value}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
