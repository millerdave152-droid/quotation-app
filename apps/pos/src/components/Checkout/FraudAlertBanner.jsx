import { AlertTriangle, CircleUser, Clock, CreditCard, ShieldAlert } from 'lucide-react';

/**
 * TeleTime POS - Fraud Alert Banner
 * Non-blocking banner shown at top of checkout when fraud risk is detected.
 *
 * Displays contextual warnings for: entry method, velocity, BIN risk,
 * high-value, customer history, and generic triggered rules.
 * 4-tier severity coloring: green/yellow/orange/red.
 */

// ---------------------------------------------------------------------------
// Severity tiers: score → color scheme
// ---------------------------------------------------------------------------

function getSeverityTier(score) {
  if (score >= 80) return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800', subtext: 'text-red-600', icon: 'text-red-600', badge: 'bg-red-600', label: 'Critical Risk' };
  if (score >= 60) return { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800', subtext: 'text-orange-600', icon: 'text-orange-600', badge: 'bg-orange-600', label: 'High Risk' };
  if (score >= 40) return { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', subtext: 'text-amber-600', icon: 'text-amber-600', badge: 'bg-amber-500', label: 'Elevated Risk' };
  return { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', subtext: 'text-yellow-600', icon: 'text-yellow-600', badge: 'bg-yellow-500', label: 'Low Risk' };
}

// ---------------------------------------------------------------------------
// Plain-language alert generators from signals
// ---------------------------------------------------------------------------

function buildAlerts(assessment) {
  const alerts = [];
  const signals = assessment.signals || {};
  const triggeredRules = assessment.triggeredRules || [];

  // --- Entry method warnings ---
  const entrySignal = signals.entry_method;
  if (entrySignal && entrySignal.riskPoints > 0) {
    const method = entrySignal.method;
    if (method === 'swipe' || method === 'fallback_swipe') {
      alerts.push({ icon: 'card', severity: 'high', message: 'CHIP FALLBACK \u2014 Card processed via magnetic stripe. Verify customer ID. Ask to re-insert chip.' });
    } else if (method === 'manual' || method === 'keyed') {
      alerts.push({ icon: 'card', severity: 'critical', message: 'MANUAL CARD ENTRY \u2014 Highest risk transaction type. Manager approval required.' });
    } else if (method === 'moto') {
      alerts.push({ icon: 'card', severity: 'high', message: 'PHONE ORDER \u2014 Verify CVV, billing address, and cardholder name.' });
    }
  }

  // --- Velocity alerts ---
  const velocitySignal = signals.velocity;
  if (velocitySignal) {
    for (const [dimension, check] of Object.entries(velocitySignal)) {
      if (check.exceeded) {
        if (dimension === 'card') {
          alerts.push({ icon: 'clock', severity: 'high', message: `Multiple transactions detected on this card in the past 5 minutes (${check.count} transactions)` });
        } else if (dimension === 'terminal') {
          alerts.push({ icon: 'clock', severity: 'medium', message: `Rapid transactions on this terminal (${check.count} in 2 minutes)` });
        } else if (dimension === 'decline') {
          alerts.push({ icon: 'clock', severity: 'high', message: `Multiple declines on this card (${check.count} in 10 minutes) \u2014 possible card testing` });
        }
      }
    }
  }

  // --- BIN risk alerts ---
  const binSignal = signals.bin_risk;
  if (binSignal && binSignal.riskPoints > 0) {
    const flags = binSignal.flags || [];
    if (flags.includes('prepaid_card')) {
      alerts.push({ icon: 'card', severity: 'medium', message: 'Prepaid card detected \u2014 verify customer identity before proceeding' });
    }
    if (flags.includes('foreign_card')) {
      alerts.push({ icon: 'card', severity: 'medium', message: 'Foreign-issued card detected \u2014 confirm billing address and ask for photo ID' });
    }
    if (flags.includes('commercial_card')) {
      alerts.push({ icon: 'card', severity: 'low', message: 'Commercial/corporate card detected' });
    }
  }

  // --- High-value alert ---
  const amountSignal = signals.amount_anomaly;
  if (amountSignal && amountSignal.riskPoints > 0) {
    alerts.push({ icon: 'warning', severity: 'medium', message: `Unusually high transaction amount (${amountSignal.zscore}\u00d7 above average) \u2014 Verify photo ID matches card name` });
  }

  // --- Customer history alerts ---
  const custSignal = signals.customer_anomaly || signals.customer_history;
  if (custSignal && custSignal.riskPoints > 0) {
    const flags = custSignal.flags || [];
    if (custSignal.chargebackCount > 0) {
      alerts.push({ icon: 'user', severity: 'high', message: `Customer has ${custSignal.chargebackCount} previous chargeback${custSignal.chargebackCount > 1 ? 's' : ''} in the last 12 months` });
    }
    if (flags.includes('new_customer_high_value')) {
      alerts.push({ icon: 'user', severity: 'medium', message: 'First-time customer \u2014 high-value purchase. Verify identification.' });
    }
    if (custSignal.reason === 'high_value_no_customer') {
      alerts.push({ icon: 'user', severity: 'medium', message: 'High-value purchase with no customer on file \u2014 consider collecting customer details' });
    }
    if (flags.some(f => f.startsWith('multi_high_value_today'))) {
      alerts.push({ icon: 'user', severity: 'medium', message: 'Customer has multiple high-value purchases today' });
    }
  }

  // --- Split transaction ---
  const splitSignal = signals.split_transaction;
  if (splitSignal && splitSignal.riskPoints > 0) {
    alerts.push({ icon: 'warning', severity: 'high', message: `Possible split transaction detected \u2014 ${splitSignal.count} transactions on this card in ${splitSignal.windowMinutes} minutes` });
  }

  // --- Card testing ---
  const cardTestSignal = signals.card_testing;
  if (cardTestSignal && cardTestSignal.riskPoints > 0) {
    alerts.push({ icon: 'card', severity: 'critical', message: `Card testing pattern detected \u2014 ${cardTestSignal.attempts} rapid small-amount attempts` });
  }

  // --- Geographic anomaly ---
  const geoSignal = signals.geographic_anomaly;
  if (geoSignal && geoSignal.riskPoints > 0) {
    alerts.push({ icon: 'warning', severity: 'critical', message: `Geographic anomaly \u2014 card used ${geoSignal.distanceKm}km away within ${geoSignal.windowMinutes} minutes` });
  }

  // --- Decline pattern ---
  const declineSignal = signals.decline_pattern;
  if (declineSignal && declineSignal.riskPoints > 0) {
    alerts.push({ icon: 'warning', severity: 'high', message: 'Suspicious decline pattern detected on this card or terminal' });
  }

  // --- Fallback: any triggered rules not covered by signals ---
  if (alerts.length === 0 && triggeredRules.length > 0) {
    for (const rule of triggeredRules) {
      alerts.push({
        icon: 'warning',
        severity: rule.severity || 'medium',
        message: `${rule.rule_name}: ${rule.details?.count !== undefined
          ? `${rule.details.count}/${rule.details.limit} in shift`
          : rule.details?.amount !== undefined
            ? `$${Number(rule.details.amount).toFixed(2)} exceeds $${Number(rule.details.threshold).toFixed(2)}`
            : rule.details?.pattern || 'Rule triggered'
        }`,
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Alert icon component
// ---------------------------------------------------------------------------

function AlertIcon({ type, className }) {
  switch (type) {
    case 'card': return <CreditCard className={className} />;
    case 'clock': return <Clock className={className} />;
    case 'user': return <CircleUser className={className} />;
    default: return <AlertTriangle className={className} />;
  }
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

/**
 * Fraud alert banner for checkout
 * @param {object} props
 * @param {object} props.assessment - Fraud assessment from backend
 * @param {function} props.onDismiss - Callback to dismiss the banner
 */
export default function FraudAlertBanner({ assessment, onDismiss }) {
  if (!assessment || assessment.riskScore < 30) return null;

  const score = assessment.riskScore;
  const tier = getSeverityTier(score);
  const alerts = buildAlerts(assessment);
  const isHighRisk = score >= 60;

  return (
    <div className={`mx-6 mt-4 p-4 rounded-lg border ${tier.bg} ${tier.border}`}>
      <div className="flex items-start gap-3">
        {isHighRisk ? (
          <ShieldAlert className={`w-6 h-6 ${tier.icon} flex-shrink-0 mt-0.5`} />
        ) : (
          <AlertTriangle className={`w-6 h-6 ${tier.icon} flex-shrink-0 mt-0.5`} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className={`text-sm font-semibold ${tier.text}`}>
              {tier.label}
              {isHighRisk ? ' \u2014 manager approval required' : ' detected'}
            </h4>
            {/* Score badge for medium+ risk */}
            {score >= 40 && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-white ${tier.badge}`}>
                {score}
              </span>
            )}
          </div>

          {/* Alert messages */}
          {alerts.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {alerts.map((alert, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <AlertIcon type={alert.icon} className={`w-4 h-4 ${tier.subtext} flex-shrink-0 mt-0.5`} />
                  <span className={`text-xs leading-relaxed ${tier.subtext}`}>
                    {alert.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Dismiss button — only for non-critical risk */}
        {!isHighRisk && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`${tier.subtext} hover:opacity-80 text-xs font-medium flex-shrink-0`}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
