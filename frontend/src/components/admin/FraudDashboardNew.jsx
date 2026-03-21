/**
 * FraudDashboardNew.jsx
 * Screen 17 — Fraud Dashboard (Pencil frame lFbgY)
 * BreadcrumbTopBar + tabs + KPIs, activity timeline, recent alerts
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const tabs = ['Overview', 'Transactions', 'Employees', 'Rules', 'Alerts', 'Reports'];

const kpis = [
  { label: 'Fraud Alerts Today', icon: 'gpp_maybe', iconClass: 'text-red-600', value: '7', valueClass: 'text-red-600', sub: '+3 from yesterday', subClass: 'text-red-600', accent: 'border-t-2 border-t-red-500' },
  { label: 'Suspicious Transactions', icon: 'search', iconClass: 'text-amber-600', value: '23', valueClass: 'text-amber-600', sub: '$12,450 flagged value', subClass: 'text-muted-foreground', accent: 'border-t-2 border-t-amber-500' },
  { label: 'Blocked Transactions', icon: 'block', iconClass: 'text-primary', value: '4', valueClass: 'text-foreground', sub: '$3,200 prevented loss', subClass: 'text-emerald-600', accent: 'border-t-2 border-t-primary' },
  { label: 'Employee Risk Score', icon: 'group', iconClass: 'text-muted-foreground', value: 'Low', valueClass: 'text-emerald-600', sub: '2 employees flagged', subClass: 'text-muted-foreground', accent: 'border-t-2 border-t-emerald-500' },
];

const alertLegend = [
  { label: 'Alerts', color: '#EF4444' },
  { label: 'Suspicious', color: '#F59E0B' },
  { label: 'Blocked', color: 'hsl(var(--lu-primary))' },
];

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const recentAlerts = [
  { icon: 'gpp_maybe', iconClass: 'text-red-600', iconBgClass: 'bg-red-500/10', title: 'Void After Sale', badge: 'Critical', badgeClass: 'text-red-600 bg-red-500/10', desc: 'TXN-4521 voided 2 min after completion', time: '3 minutes ago', rowClass: 'bg-red-500/5' },
  { icon: 'credit_card', iconClass: 'text-red-600', iconBgClass: 'bg-red-500/10', title: 'Duplicate Transaction', badge: 'Critical', badgeClass: 'text-red-600 bg-red-500/10', desc: 'Same amount $847.50 charged twice in 30s', time: '12 minutes ago', rowClass: 'bg-red-500/5' },
  { icon: 'warning', iconClass: 'text-amber-600', iconBgClass: 'bg-amber-500/10', title: 'High Discount Override', badge: 'Warning', badgeClass: 'text-amber-600 bg-amber-500/10', desc: '35% discount applied without manager approval', time: '28 minutes ago', rowClass: '' },
  { icon: 'schedule', iconClass: 'text-blue-600', iconBgClass: 'bg-blue-500/10', title: 'Off-Hours Access', badge: 'Info', badgeClass: 'text-blue-600 bg-blue-500/10', desc: 'Register accessed at 11:42 PM by John D.', time: '1 hour ago', rowClass: '' },
];

export default function FraudDashboardNew() {
  const [activeTab, setActiveTab] = useState('Overview');

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.2}} className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Fraud Detection & Prevention']}
        rightContent={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-emerald-500/10">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-secondary text-xs font-medium text-emerald-600">Live Monitoring</span>
            </div>
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5 shadow-sm hover:shadow transition">
              <span className="material-symbols-rounded text-sm">notifications</span>3 Alerts
            </button>
          </div>
        }
      />

      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-8 py-2 bg-card border-b border-border shrink-0">
        {tabs.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`font-secondary text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${activeTab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <motion.div key={k.label} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.2,delay:i*0.05}}
              className={`bg-gradient-to-br from-card to-card/50 rounded-xl p-5 flex flex-col gap-2 border border-border shadow-sm hover:shadow-md transition-shadow ${k.accent}`}>
              <div className="flex items-center gap-2">
                <span className={`material-symbols-rounded text-base ${k.iconClass}`}>{k.icon}</span>
                <span className="font-secondary text-xs font-medium text-muted-foreground">{k.label}</span>
              </div>
              <span className={`font-primary text-3xl tracking-tight font-bold ${k.valueClass}`}>{k.value}</span>
              <span className={`font-secondary text-[11px] font-medium ${k.subClass}`}>{k.sub}</span>
            </motion.div>
          ))}
        </div>

        {/* Mid Row */}
        <div className="flex gap-6">
          {/* Activity Timeline */}
          <div className="flex-1 bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-secondary text-base font-semibold text-foreground">Fraud Activity Timeline</span>
              <span className="font-secondary text-xs text-muted-foreground">Last 7 Days</span>
            </div>
            <div className="flex-1 rounded-lg bg-gradient-to-t from-primary/20 to-transparent flex flex-col items-center justify-center relative" style={{ minHeight: 200 }}>
              <div className="absolute inset-x-4 top-1/4 border-b border-dashed border-border/30" />
              <div className="absolute inset-x-4 top-1/2 border-b border-dashed border-border/30" />
              <div className="absolute inset-x-4 top-3/4 border-b border-dashed border-border/30" />
              <span className="font-secondary text-sm text-muted-foreground">Activity Timeline Chart</span>
            </div>
            <div className="flex items-center justify-between">
              {days.map((d) => (
                <span key={d} className="font-secondary text-[11px] text-muted-foreground">{d}</span>
              ))}
            </div>
            <div className="flex items-center gap-4">
              {alertLegend.map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                  <span className="font-secondary text-[11px] text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Alerts */}
          <div className="w-[420px] shrink-0 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-secondary text-sm font-semibold text-foreground">Recent Alerts</span>
              <span className="font-primary text-[10px] font-semibold rounded-full px-2 py-0.5 text-red-600 bg-red-500/10">3 Critical</span>
            </div>
            <div className="flex-1 flex flex-col">
              {recentAlerts.map((a, i) => (
                <div key={a.title} className={`flex items-start gap-3 px-5 py-3 ${a.rowClass} ${i < recentAlerts.length - 1 ? 'border-b border-border' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.iconBgClass}`}>
                    <span className={`material-symbols-rounded text-base ${a.iconClass}`}>{a.icon}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-secondary text-xs font-semibold text-foreground">{a.title}</span>
                      <span className={`font-secondary text-[9px] font-semibold rounded px-1.5 py-0.5 ${a.badgeClass}`}>{a.badge}</span>
                    </div>
                    <span className="font-secondary text-[11px] text-muted-foreground">{a.desc}</span>
                    <span className="font-secondary text-[10px] text-muted-foreground">{a.time}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border">
              <span className="font-secondary text-[13px] font-medium text-primary cursor-pointer">View All Alerts →</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
