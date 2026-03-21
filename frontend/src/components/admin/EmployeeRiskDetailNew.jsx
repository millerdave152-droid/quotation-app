/**
 * EmployeeRiskDetailNew.jsx
 * Screen 21 — Employee Risk Detail (Pencil frame mNmMl)
 * BreadcrumbTopBar + sidebar profile/risk + main stats/timeline
 */

import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

const profileInfo = [
  { label: 'Department', value: 'Sales Floor' },
  { label: 'Hire Date', value: 'Mar 15, 2024' },
  { label: 'Shift', value: 'Morning (8am-4pm)' },
  { label: 'Register', value: 'Register 3' },
];

const riskBars = [
  { factor: 'Void Frequency', level: 'High', color: '#EF4444', w: '82%' },
  { factor: 'Discount Overrides', level: 'High', color: '#EF4444', w: '71%' },
  { factor: 'Off-Hours Activity', level: 'Medium', color: '#F59E0B', w: '50%' },
  { factor: 'Cash Discrepancy', level: 'Low', color: '#22C55E', w: '21%' },
];

const stats = [
  { value: '7', valueColor: '#EF4444', label: 'Total Incidents' },
  { value: '5', label: 'Voids' },
  { value: '$1,420', valueColor: '#EF4444', label: 'Discount Value' },
  { value: '2', valueColor: '#F59E0B', label: 'Off-Hours Access' },
];

const incidents = [
  { dotColor: '#EF4444', title: 'Void After Sale — TXN-4521', badge: 'Critical', badgeColor: '#EF4444', badgeBg: '#EF444415', desc: 'Voided $245.00 transaction 2 minutes after completion. No customer present at register.', time: 'Today, 10:23 AM · Register 3', bg: '#EF444406' },
  { dotColor: '#F59E0B', title: 'Discount Override — TXN-4510', badge: 'Warning', badgeColor: '#F59E0B', badgeBg: '#F59E0B15', desc: 'Applied 35% discount without manager approval on $1,250 order.', time: 'Today, 9:15 AM · Register 3' },
  { dotColor: '#EF4444', title: 'Multiple Voids — 3 transactions', badge: 'Critical', badgeColor: '#EF4444', badgeBg: '#EF444415', desc: '3 voided transactions within 45-minute window totaling $892. Pattern suggests systematic void abuse.', time: 'Yesterday, 2:10 PM - 2:55 PM · Register 3' },
  { dotColor: '#3B82F6', title: 'Off-Hours Register Access', badge: 'Info', badgeColor: '#3B82F6', badgeBg: '#3B82F615', desc: 'Register accessed at 11:42 PM, outside assigned shift hours. 2 transactions processed totaling $178.', time: 'Feb 25, 11:42 PM · Register 3', bg: '#3B82F606' },
  { dotColor: '#F59E0B', title: 'Cash Drawer Discrepancy', badge: 'Warning', badgeColor: '#F59E0B', badgeBg: '#F59E0B15', desc: 'Cash drawer short $47.25 at end of shift. Third occurrence this month.', time: 'Feb 24, 4:00 PM · Register 3', bg: '#F59E0B06' },
];

export default function EmployeeRiskDetailNew() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <BreadcrumbTopBar title={['Fraud Detection', 'Employees', 'Mike Smith']}
        rightContent={
          <div className="flex items-center gap-3">
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">flag</span>Flag Employee
            </button>
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">download</span>Export Report
            </button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-[320px] shrink-0 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Profile Card */}
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <span className="font-primary text-[22px] font-semibold text-foreground">MS</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-primary text-lg font-bold text-foreground">Mike Smith</span>
              <span className="font-secondary text-[13px] text-muted-foreground">Cashier · Employee #1042</span>
            </div>
            <div className="flex items-center gap-2 rounded-full px-6 py-2" style={{ background: '#EF4444' }}>
              <span className="material-symbols-rounded text-base text-white">shield</span>
              <span className="font-primary text-[13px] font-bold text-white">Risk Score: 85 / 100</span>
            </div>
            <div className="w-full h-px bg-border" />
            <div className="w-full flex flex-col gap-2.5">
              {profileInfo.map((p) => (
                <div key={p.label} className="flex justify-between">
                  <span className="font-secondary text-xs text-muted-foreground">{p.label}</span>
                  <span className="font-secondary text-xs font-medium text-foreground">{p.value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center">
                <span className="font-secondary text-xs text-muted-foreground">Status</span>
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: '#EF444415', color: '#EF4444' }}>Under Investigation</span>
              </div>
            </div>
          </div>

          {/* Risk Breakdown */}
          <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
            <span className="font-secondary text-sm font-semibold text-foreground">Risk Breakdown</span>
            {riskBars.map((r) => (
              <div key={r.factor} className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="font-secondary text-xs text-foreground">{r.factor}</span>
                  <span className="font-secondary text-[10px] font-semibold" style={{ color: r.color }}>{r.level}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary">
                  <div className="h-1.5 rounded-full" style={{ width: r.w, background: r.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex flex-col items-center gap-1">
                <span className="font-primary text-2xl font-bold" style={{ color: s.valueColor || 'hsl(var(--lu-foreground))' }}>{s.value}</span>
                <span className="font-secondary text-[11px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Incident Timeline */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-secondary text-sm font-semibold text-foreground">Incident Timeline</span>
              <span className="font-secondary text-[11px] text-muted-foreground">Last 7 Days</span>
            </div>
            <div className="flex flex-col">
              {incidents.map((inc, i) => (
                <div key={inc.title} className={`flex gap-4 px-5 py-4 ${i < incidents.length - 1 ? 'border-b border-border' : ''}`}
                  style={inc.bg ? { background: inc.bg } : undefined}>
                  {/* Timeline dot + connector */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: inc.dotColor }} />
                    {i < incidents.length - 1 && <div className="w-0.5 flex-1 mt-1" style={{ background: 'hsl(var(--lu-border))' }} />}
                  </div>
                  {/* Content */}
                  <div className="flex flex-col gap-1 flex-1 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-secondary text-[13px] font-semibold text-foreground">{inc.title}</span>
                      <span className="font-secondary text-[9px] font-semibold rounded px-1.5 py-0.5" style={{ background: inc.badgeBg, color: inc.badgeColor }}>{inc.badge}</span>
                    </div>
                    <span className="font-secondary text-xs text-muted-foreground">{inc.desc}</span>
                    <span className="font-secondary text-[10px] text-muted-foreground">{inc.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
