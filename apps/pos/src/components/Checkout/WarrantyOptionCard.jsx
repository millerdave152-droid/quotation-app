/**
 * TeleTime POS - Warranty Option Card Component
 * Individual warranty plan selection card
 */

import {
  CheckCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import { formatCurrency } from '../../utils/formatters';

/**
 * Coverage bullet point
 */
function CoverageBullet({ text }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
      <span className="text-sm text-gray-600">{text}</span>
    </li>
  );
}

/**
 * Warranty option card component
 */
export function WarrantyOptionCard({
  warranty,
  isSelected,
  onSelect,
  compact = false,
}) {
  // Generate coverage bullets from coverage details
  const getCoverageBullets = () => {
    const bullets = [];
    const details = warranty.coverageDetails || {};

    if (details.parts && details.labor) {
      bullets.push('Full parts & labor coverage');
    } else if (details.parts) {
      bullets.push('Parts replacement included');
    } else if (details.labor) {
      bullets.push('Labor costs covered');
    }

    if (details.accidental_drops || details.liquid_spills) {
      bullets.push('Accidental damage protection');
    }

    if (details.cracked_screens) {
      bullets.push('Cracked screen repair');
    }

    if (details.electrical_surge) {
      bullets.push('Power surge protection');
    }

    if (details.in_home_service) {
      bullets.push('Convenient in-home service');
    }

    if (details.phone_support) {
      bullets.push('24/7 phone support');
    }

    if (details.priority_service) {
      bullets.push('Priority repair service');
    }

    // Ensure we have at least 3 bullets
    if (bullets.length < 3) {
      if (!bullets.includes('Full parts & labor coverage')) {
        bullets.push('Manufacturer defect coverage');
      }
      if (bullets.length < 3) {
        bullets.push('Easy claims process');
      }
      if (bullets.length < 3) {
        bullets.push('No hidden fees');
      }
    }

    return bullets.slice(0, 4); // Max 4 bullets
  };

  const coverageBullets = getCoverageBullets();

  return (
    <button
      type="button"
      onClick={() => onSelect(warranty)}
      className={`
        relative w-full text-left rounded-2xl border-2 transition-all duration-200
        ${isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
        }
        ${compact ? 'p-4' : 'p-5'}
      `}
    >
      {/* Badge */}
      {warranty.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm">
            <SparklesIcon className="w-3.5 h-3.5" />
            {warranty.badge}
          </span>
        </div>
      )}

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-4 right-4">
          <CheckCircleSolid className="w-6 h-6 text-blue-500" />
        </div>
      )}

      {/* Content */}
      <div className={warranty.badge ? 'mt-2' : ''}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className={`font-bold text-gray-900 ${compact ? 'text-base' : 'text-lg'}`}>
              {warranty.name}
            </h3>
            <p className="text-sm text-gray-500">
              {warranty.durationMonths} months of coverage
            </p>
          </div>
        </div>

        {/* Price display */}
        <div className="mb-4 p-3 bg-gray-50 rounded-xl">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-gray-500">Just</span>
            <span className={`font-bold text-blue-600 ${compact ? 'text-xl' : 'text-2xl'}`}>
              {formatCurrency(warranty.pricePerMonth)}
            </span>
            <span className="text-sm text-gray-500">/month</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {formatCurrency(warranty.price)} total for {warranty.durationMonths} months
          </p>
          {warranty.deductible > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              {formatCurrency(warranty.deductible)} deductible per claim
            </p>
          )}
        </div>

        {/* Coverage bullets */}
        <ul className="space-y-2">
          {coverageBullets.map((bullet, idx) => (
            <CoverageBullet key={idx} text={bullet} />
          ))}
        </ul>
      </div>
    </button>
  );
}

export default WarrantyOptionCard;
