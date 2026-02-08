/**
 * TeleTime POS - Fraud Alert Banner
 * Non-blocking amber/red banner shown at top of checkout when fraud risk is detected.
 */

import { ExclamationTriangleIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline';

/**
 * Fraud alert banner for checkout
 * @param {object} props
 * @param {object} props.assessment - Fraud assessment from backend
 * @param {function} props.onDismiss - Callback to dismiss the banner
 */
export default function FraudAlertBanner({ assessment, onDismiss }) {
  if (!assessment || assessment.riskScore < 30) return null;

  const isHighRisk = assessment.riskScore >= 60;
  const triggeredRules = assessment.triggeredRules || [];

  return (
    <div className={`mx-6 mt-4 p-4 rounded-lg border ${
      isHighRisk
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-start gap-3">
        {isHighRisk ? (
          <ShieldExclamationIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
        ) : (
          <ExclamationTriangleIcon className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <h4 className={`text-sm font-semibold ${isHighRisk ? 'text-red-800' : 'text-amber-800'}`}>
            {isHighRisk
              ? 'High risk — manager approval required'
              : 'Elevated risk detected'}
          </h4>
          <p className={`text-xs mt-1 ${isHighRisk ? 'text-red-600' : 'text-amber-600'}`}>
            Risk Score: {assessment.riskScore}/100
          </p>
          {triggeredRules.length > 0 && (
            <ul className="mt-2 space-y-1">
              {triggeredRules.map((rule, idx) => (
                <li key={idx} className={`text-xs ${isHighRisk ? 'text-red-700' : 'text-amber-700'}`}>
                  &bull; {rule.rule_name}: {rule.details?.count !== undefined
                    ? `${rule.details.count}/${rule.details.limit} in shift`
                    : rule.details?.amount !== undefined
                      ? `$${Number(rule.details.amount).toFixed(2)} exceeds $${Number(rule.details.threshold).toFixed(2)}`
                      : rule.details?.discount_percent
                        ? `${rule.details.discount_percent}% discount exceeds ${rule.details.threshold}%`
                        : rule.details?.pattern || 'Rule triggered'
                  }
                </li>
              ))}
            </ul>
          )}
        </div>
        {!isHighRisk && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-amber-500 hover:text-amber-700 text-xs font-medium"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
