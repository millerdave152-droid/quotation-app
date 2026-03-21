/**
 * StatusPill.jsx — Shared Component
 * Colored status badge pill for any status type
 *
 * Props:
 *   status — one of the predefined status keys
 *   label  — optional text override (defaults to config label)
 */

const STATUS_CONFIG = {
  approved:  { bg: 'bg-[#22C55E15]', text: 'text-[#22C55E]', label: 'Approved' },
  completed: { bg: 'bg-[#22C55E15]', text: 'text-[#22C55E]', label: 'Completed' },
  available: { bg: 'bg-[#22C55E15]', text: 'text-[#22C55E]', label: 'Available' },
  sent:      { bg: 'bg-[#22C55E15]', text: 'text-[#22C55E]', label: 'Sent' },
  sale:      { bg: 'bg-[#22C55E15]', text: 'text-[#22C55E]', label: 'Sale' },
  pending:   { bg: 'bg-[#F59E0B15]', text: 'text-[#F59E0B]', label: 'Pending' },
  'in-use':  { bg: 'bg-[#F59E0B15]', text: 'text-[#F59E0B]', label: 'In Use' },
  refunded:  { bg: 'bg-[#EF444415]', text: 'text-[#EF4444]', label: 'Refunded' },
  expired:   { bg: 'bg-[#EF444415]', text: 'text-[#EF4444]', label: 'Expired' },
  lost:      { bg: 'bg-[#EF444415]', text: 'text-[#EF4444]', label: 'Lost' },
  offline:   { bg: 'bg-[#EF444415]', text: 'text-[#EF4444]', label: 'Offline' },
  return:    { bg: 'bg-[#EF444415]', text: 'text-[#EF4444]', label: 'Return' },
  draft:     { bg: 'bg-[#3B82F615]', text: 'text-[#3B82F6]', label: 'Draft' },
  exchange:  { bg: 'bg-[#3B82F615]', text: 'text-[#3B82F6]', label: 'Exchange' },
};

export default function StatusPill({ status, label }) {
  const config = STATUS_CONFIG[status] || {
    bg: 'bg-secondary',
    text: 'text-foreground',
    label: status,
  };

  return (
    <span
      className={`inline-flex items-center px-2 h-[22px] rounded-full text-[11px] font-semibold ${config.bg} ${config.text}`}
    >
      {label || config.label}
    </span>
  );
}
