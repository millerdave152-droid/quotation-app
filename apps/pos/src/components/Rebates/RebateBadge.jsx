/**
 * TeleTime POS - Rebate Badge Component
 * Displays rebate badges on products and cart line items
 */

import { useState } from 'react';
import {
  BanknotesIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

/**
 * Format currency
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

/**
 * Single Rebate Badge
 */
export function RebateBadge({
  type,
  amount,
  manufacturer,
  name,
  applied = false,
  compact = false,
  onClick,
  showTooltip = true,
}) {
  const [isHovered, setIsHovered] = useState(false);

  const config = {
    instant: {
      icon: BanknotesIcon,
      bgColor: applied ? 'bg-green-100' : 'bg-green-50',
      textColor: applied ? 'text-green-800' : 'text-green-700',
      borderColor: applied ? 'border-green-300' : 'border-green-200',
      label: 'Instant Rebate',
      emoji: '\u{1F4B0}', // Money bag
    },
    mail_in: {
      icon: EnvelopeIcon,
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
      label: 'Mail-in Rebate',
      emoji: '\u{1F4EC}', // Mailbox with mail
    },
    online: {
      icon: GlobeAltIcon,
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700',
      borderColor: 'border-purple-200',
      label: 'Online Rebate',
      emoji: '\u{1F310}', // Globe
    },
  };

  const { icon: Icon, bgColor, textColor, borderColor, label, emoji } = config[type] || config.instant;

  if (compact) {
    return (
      <span
        className={`
          inline-flex items-center gap-1 px-1.5 py-0.5
          text-xs font-medium rounded
          ${bgColor} ${textColor} border ${borderColor}
          ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
        `}
        onClick={onClick}
        title={`${label}: ${formatCurrency(amount)}${manufacturer ? ` from ${manufacturer}` : ''}`}
      >
        <span className="text-[10px]">{emoji}</span>
        <span>{formatCurrency(amount)}</span>
        {applied && <span className="text-[10px]">*</span>}
      </span>
    );
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={onClick}
        className={`
          inline-flex items-center gap-1.5 px-2.5 py-1
          text-sm font-medium rounded-lg
          ${bgColor} ${textColor} border ${borderColor}
          transition-all
          ${onClick ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'}
          ${applied ? 'ring-2 ring-green-400 ring-offset-1' : ''}
        `}
      >
        <span className="text-base">{emoji}</span>
        <span>{formatCurrency(amount)} {label}</span>
        {type !== 'instant' && (
          <InformationCircleIcon className="w-4 h-4 opacity-60" />
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && isHovered && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap">
          <div className="font-medium">{name || label}</div>
          {manufacturer && (
            <div className="text-gray-300">from {manufacturer}</div>
          )}
          {applied && (
            <div className="text-green-400 mt-1">Applied to order</div>
          )}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900" />
        </div>
      )}
    </div>
  );
}

/**
 * Multiple Rebate Badges Container
 */
export function RebateBadges({
  rebates = [],
  compact = false,
  maxDisplay = 3,
  onRebateClick,
}) {
  if (!rebates || rebates.length === 0) return null;

  const displayRebates = rebates.slice(0, maxDisplay);
  const remainingCount = rebates.length - maxDisplay;

  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1' : 'gap-2'}`}>
      {displayRebates.map((rebate, index) => (
        <RebateBadge
          key={rebate.rebateId || index}
          type={rebate.rebateType || rebate.type}
          amount={rebate.amount || rebate.unitAmount}
          manufacturer={rebate.manufacturer}
          name={rebate.rebateName || rebate.name}
          applied={rebate.applied}
          compact={compact}
          onClick={onRebateClick ? () => onRebateClick(rebate) : undefined}
        />
      ))}
      {remainingCount > 0 && (
        <span className={`
          inline-flex items-center px-2 py-0.5
          text-xs font-medium text-gray-500 bg-gray-100 rounded
        `}>
          +{remainingCount} more
        </span>
      )}
    </div>
  );
}

/**
 * Product Rebate Indicator
 * Shows on product tiles/cards in the grid
 */
export function ProductRebateIndicator({ rebates = [], onClick }) {
  if (!rebates || rebates.length === 0) return null;

  const instantRebates = rebates.filter(r => (r.rebateType || r.type) === 'instant');
  const otherRebates = rebates.filter(r => (r.rebateType || r.type) !== 'instant');

  const totalInstant = instantRebates.reduce((sum, r) => sum + (r.amount || r.unitAmount || 0), 0);
  const totalOther = otherRebates.reduce((sum, r) => sum + (r.amount || r.unitAmount || 0), 0);

  return (
    <div
      className="absolute top-2 right-2 flex flex-col gap-1 cursor-pointer"
      onClick={onClick}
    >
      {totalInstant > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-full shadow-md">
          <span>\u{1F4B0}</span>
          <span>-{formatCurrency(totalInstant)}</span>
        </div>
      )}
      {totalOther > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white text-xs font-bold rounded-full shadow-md">
          <span>\u{1F4EC}</span>
          <span>{formatCurrency(totalOther)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Cart Line Item Rebate Display
 * Shows rebates applied to a specific cart item
 */
export function CartItemRebates({
  instantRebates = [],
  mailInRebates = [],
  onlineRebates = [],
  onInfoClick,
}) {
  const hasMailIn = mailInRebates.length > 0 || onlineRebates.length > 0;

  if (instantRebates.length === 0 && !hasMailIn) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      {/* Applied instant rebates */}
      {instantRebates.map((rebate, index) => (
        <span
          key={`instant-${index}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded"
        >
          <span>\u{1F4B0}</span>
          <span>-{formatCurrency(rebate.amount)}</span>
          {rebate.applied && <span className="text-green-600">applied</span>}
        </span>
      ))}

      {/* Mail-in/online rebates available */}
      {hasMailIn && (
        <button
          type="button"
          onClick={onInfoClick}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
        >
          <span>\u{1F4EC}</span>
          <span>
            {formatCurrency(
              [...mailInRebates, ...onlineRebates].reduce((sum, r) => sum + r.amount, 0)
            )} rebate available
          </span>
          <InformationCircleIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default RebateBadge;
