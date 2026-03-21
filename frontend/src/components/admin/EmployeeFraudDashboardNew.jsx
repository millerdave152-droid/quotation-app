/**
 * EmployeeFraudDashboardNew.jsx
 * Screen 20 — Employee Fraud Dashboard (Pencil frame Sj5yN)
 * BreadcrumbTopBar + KPIs, employee risk assessment table
 */

import { useState } from 'react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const periodOpts = ['7d', '30d', '90d'];

const kpis = [
  { icon: 'person_off', iconColor: '#EF4444', label: 'High Risk Employees', value: '2', valueColor: '#EF4444', sub: 'Requires immediate review', subColor: '#EF4444', borderColor: '#EF4444' },
  { icon: 'search', iconColor: '#F59E0B', label: 'Active Investigations', value: '4', valueColor: '#F59E0B', sub: 'Across 3 departments' },
  { icon: 'speed', iconColor: 'hsl(var(--lu-muted-foreground))', label: 'Avg Risk Score', value: '28', sub: 'Team average (low risk)', subColor: '#22C55E' },
  { icon: 'description', iconColor: 'hsl(var(--lu-muted-foreground))', label: 'Total Incidents (7d)', value: '14', sub: '+3 from last week', subColor: '#EF4444' },
];

const employees = [
  { initials: 'MS', name: 'Mike Smith', role: 'Cashier #1042', dept: 'Sales Floor', score: 85, scoreBg: '#EF4444', incidents: 7, incColor: '#EF4444', voids: 5, discounts: '$1,420', discColor: '#EF4444', status: 'Under Investigation', statusColor: '#EF4444', statusBg: '#EF444415', trend: 'trending_up', trendColor: '#EF4444', action: 'Review', highlight: true },
  { initials: 'JD', name: 'John Davis', role: 'Cashier #1078', dept: 'Checkout', score: 78, scoreBg: '#EF4444', incidents: 5, incColor: '#EF4444', voids: 3, discounts: '$890', discColor: '#EF4444', status: 'Under Investigation', statusColor: '#EF4444', statusBg: '#EF444415', trend: 'trending_up', trendColor: '#EF4444', action: 'Review', highlight: true },
  { initials: 'SC', name: 'Sarah Chen', role: 'Sr. Cashier #1015', dept: 'Checkout', score: 45, scoreBg: '#F59E0B', incidents: 2, voids: 1, discounts: '$320', status: 'Monitoring', statusColor: '#F59E0B', statusBg: '#F59E0B15', trend: 'remove', trendColor: '#F59E0B', action: 'View' },
  { initials: 'DP', name: 'David Park', role: 'Cashier #1089', dept: 'Sales Floor', score: 18, scoreBg: '#22C55E', incidents: 0, voids: 0, discounts: '$45', status: 'Clear', statusColor: '#22C55E', statusBg: '#22C55E15', trend: 'trending_down', trendColor: '#22C55E', action: 'View' },
  { initials: 'JW', name: 'Jane Wilson', role: 'Manager #1003', dept: 'Management', score: 12, scoreBg: '#22C55E', incidents: 0, voids: 0, discounts: '$0', status: 'Clear', statusColor: '#22C55E', statusBg: '#22C55E15', trend: 'trending_down', trendColor: '#22C55E', action: 'View' },
];

export default function EmployeeFraudDashboardNew() {
  const [activePeriod, setActivePeriod] = useState('7d');

  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Employee Fraud Monitoring']}
        rightContent={
          <div className="flex items-center border border-border rounded-full overflow-hidden">
            {periodOpts.map((p) => (
              <button key={p} onClick={() => setActivePeriod(p)}
                className={`h-7 px-3 font-secondary text-xs font-medium transition-colors ${activePeriod === p ? 'bg-primary text-white' : 'bg-background text-foreground'}`}>
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card rounded-xl p-5 flex flex-col gap-2"
              style={{ border: k.borderColor ? `2px solid ${k.borderColor}` : '1px solid hsl(var(--lu-border))' }}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-rounded text-base" style={{ color: k.iconColor }}>{k.icon}</span>
                <span className="font-secondary text-xs text-muted-foreground">{k.label}</span>
              </div>
              <span className="font-primary text-[28px] font-bold" style={{ color: k.valueColor || 'hsl(var(--lu-foreground))' }}>{k.value}</span>
              <span className="font-secondary text-[11px] font-medium" style={{ color: k.subColor || 'hsl(var(--lu-muted-foreground))' }}>{k.sub}</span>
            </div>
          ))}
        </div>

        {/* Employee Risk Assessment Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="font-secondary text-sm font-semibold text-foreground">Employee Risk Assessment</span>
            <span className="font-secondary text-[11px] text-muted-foreground">Sorted by risk score</span>
          </div>
          <div className="flex items-center bg-background px-5 py-2.5 border-b border-border">
            <span className="font-secondary text-xs font-semibold text-muted-foreground" style={{ width: 200 }}>Employee</span>
            <span className="font-secondary text-xs font-semibold text-muted-foreground" style={{ width: 120 }}>Department</span>
            <span className="font-secondary text-xs font-semibold text-muted-foreground text-center" style={{ width: 100 }}>Risk Score</span>
            <span className="font-secondary text-xs font-semibold text-muted-foreground text-center" style={{ width: 80 }}>Incidents</span>
            <span className="font-secondary text-xs font-semibold text-muted-foreground text-center" style={{ width: 70 }}>Voids</span>
            <span className="font-secondary text-xs font-semibold text-muted-foreground text-center" style={{ width: 90 }}>Discounts</span>
            <span className="font-secondary text-xs font-semibold text-muted-foreground text-center" style={{ width: 120 }}>Status</span>
            <span className="font-secondary text-xs font-semibold text-muted-foreground text-center" style={{ width: 60 }}>Trend</span>
            <span className="font-secondary text-xs font-semibold text-muted-foreground text-right flex-1">Action</span>
          </div>
          {employees.map((e, i) => (
            <div key={e.initials} className={`flex items-center px-5 py-3 ${i < employees.length - 1 ? 'border-b border-border' : ''}`}
              style={e.highlight ? { background: '#EF444406' } : undefined}>
              <div className="flex items-center gap-2" style={{ width: 200 }}>
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <span className="font-primary text-[10px] font-semibold text-foreground">{e.initials}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-secondary text-xs font-semibold text-foreground">{e.name}</span>
                  <span className="font-secondary text-[10px] text-muted-foreground">{e.role}</span>
                </div>
              </div>
              <span className="font-secondary text-xs text-foreground" style={{ width: 120 }}>{e.dept}</span>
              <div className="flex justify-center" style={{ width: 100 }}>
                <span className="font-primary text-[11px] font-bold text-white rounded-md px-3 py-1" style={{ background: e.scoreBg }}>{e.score}</span>
              </div>
              <span className="font-primary text-xs font-semibold text-center" style={{ width: 80, color: e.incColor || 'hsl(var(--lu-foreground))' }}>{e.incidents}</span>
              <span className="font-primary text-xs text-foreground text-center" style={{ width: 70 }}>{e.voids}</span>
              <span className="font-primary text-xs font-semibold text-center" style={{ width: 90, color: e.discColor || 'hsl(var(--lu-foreground))' }}>{e.discounts}</span>
              <div className="flex justify-center" style={{ width: 120 }}>
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: e.statusBg, color: e.statusColor }}>{e.status}</span>
              </div>
              <div className="flex justify-center" style={{ width: 60 }}>
                <span className="material-symbols-rounded text-base" style={{ color: e.trendColor }}>{e.trend}</span>
              </div>
              <div className="flex justify-end flex-1">
                <button className="px-3 py-1 rounded-md border border-border font-secondary text-[11px] font-medium text-foreground">{e.action}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
