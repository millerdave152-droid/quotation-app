/**
 * FraudDetectionDialogNew.jsx
 * Screen 16 — Fraud Detection Dialog (Pencil frame 8UIS7)
 * Fixed overlay with centered 520px card: risk score, indicators, actions
 */

const indicators = [
  { icon: 'warning', iconColor: '#EF4444', text: 'Mismatched billing and shipping addresses', score: '+25', scoreColor: '#EF4444', bg: '#EF444406' },
  { icon: 'warning', iconColor: '#EF4444', text: 'Multiple declined cards on same transaction', score: '+30', scoreColor: '#EF4444', bg: '#EF444406' },
  { icon: 'info', iconColor: '#F59E0B', text: 'High-value transaction exceeds $5,000 threshold', score: '+15', scoreColor: '#F59E0B', bg: '#F59E0B06' },
  { icon: 'info', iconColor: '#F59E0B', text: 'New customer with no purchase history', score: '+17', scoreColor: '#F59E0B', bg: '#F59E0B06' },
];

export default function FraudDetectionDialogNew() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-[520px] max-h-[700px] bg-background rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-6 shrink-0" style={{ background: '#EF444410' }}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-2xl" style={{ color: '#EF4444' }}>gpp_maybe</span>
            <span className="font-secondary text-[15px] font-semibold" style={{ color: '#EF4444' }}>Fraud Alert — Transaction Blocked</span>
          </div>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary">
            <span className="material-symbols-rounded text-lg text-muted-foreground">close</span>
          </button>
        </div>
        <div className="h-px w-full" style={{ background: '#EF444430' }} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {/* Risk Score Card */}
          <div className="rounded-xl p-5 flex items-center gap-5" style={{ background: '#EF444408', border: '1px solid #EF444420' }}>
            <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center shrink-0" style={{ background: '#EF444415' }}>
              <span className="font-primary text-2xl font-bold" style={{ color: '#EF4444' }}>87</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-secondary text-sm font-semibold text-foreground">Fraud Risk Score</span>
              <span className="font-secondary text-xs" style={{ color: '#EF4444' }}>HIGH RISK — This transaction has been automatically blocked due to multiple fraud indicators.</span>
            </div>
          </div>

          {/* Triggered Indicators */}
          <span className="font-secondary text-sm font-semibold text-foreground">Triggered Indicators</span>
          <div className="flex flex-col gap-2">
            {indicators.map((ind) => (
              <div key={ind.text} className="flex items-center gap-2.5 h-10 px-3 rounded-lg" style={{ background: ind.bg }}>
                <span className="material-symbols-rounded text-base" style={{ color: ind.iconColor }}>{ind.icon}</span>
                <span className="font-secondary text-xs text-foreground flex-1">{ind.text}</span>
                <span className="font-primary text-xs font-semibold" style={{ color: ind.scoreColor }}>{ind.score}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-border" />

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-2.5">
              <button className="flex-1 h-10 bg-primary text-primary-foreground rounded-full font-primary text-xs font-medium flex items-center justify-center gap-1.5">
                <span className="material-symbols-rounded text-sm">shield_person</span>Manager Override
              </button>
              <button className="flex-1 h-10 border border-border text-foreground rounded-full font-primary text-xs font-medium flex items-center justify-center gap-1.5">
                <span className="material-symbols-rounded text-sm">flag</span>Report Fraud
              </button>
            </div>
            <button className="w-full h-10 border border-border text-foreground rounded-full font-primary text-xs font-medium flex items-center justify-center gap-1.5">
              <span className="material-symbols-rounded text-sm">block</span>Cancel Transaction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
