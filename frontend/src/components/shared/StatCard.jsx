/**
 * StatCard.jsx — Shared Component
 * KPI / stat card with optional icon and subtitle
 *
 * Props:
 *   label         — top label text (e.g. "Revenue")
 *   value         — large value text (e.g. "$847,250")
 *   valueColor    — optional Tailwind text color class for value
 *   subtitle      — optional subtitle text
 *   subtitleColor — optional color string (hex or Tailwind class) for subtitle
 *   subtitleLabel — optional secondary label after subtitle
 *   icon          — optional lucide icon component
 *   iconColor     — optional color string for icon
 */

import { motion } from 'framer-motion';

export default function StatCard({
  label,
  value,
  valueColor,
  subtitle,
  subtitleColor,
  subtitleLabel,
  icon: Icon,
  iconColor,
  delay = 0,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex flex-col gap-1.5 p-4 bg-card border border-border rounded-xl"
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-secondary text-[11px]">
          {label}
        </span>
        {Icon && (
          <Icon size={16} style={iconColor ? { color: iconColor } : undefined} />
        )}
      </div>
      <span
        className={`font-primary text-2xl font-bold ${valueColor || 'text-foreground'}`}
      >
        {value}
      </span>
      {subtitle && (
        <div className="flex items-center gap-1">
          <span
            className={`font-secondary text-[11px] ${
              subtitleColor?.startsWith('#') || subtitleColor?.startsWith('var(')
                ? 'font-semibold'
                : subtitleColor || 'text-muted-foreground'
            }`}
            style={
              subtitleColor?.startsWith('#') || subtitleColor?.startsWith('var(')
                ? { color: subtitleColor }
                : undefined
            }
          >
            {subtitle}
          </span>
          {subtitleLabel && (
            <span className="text-muted-foreground font-secondary text-[11px]">
              {subtitleLabel}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
