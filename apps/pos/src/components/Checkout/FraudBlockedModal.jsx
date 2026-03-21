/**
 * TeleTime POS - Fraud Blocked Modal
 * Blocking modal shown when risk score >= 80.
 * Displays plain-language reasons, Code 10 instructions,
 * alternative payment option, and manager PIN override.
 */

import { useState, useEffect } from 'react';
import { ManagerApprovalModal } from './ManagerApprovalModal';
import { AlertTriangle, Lock, Phone, RefreshCw, ShieldAlert } from 'lucide-react';

// ============================================================================
// PLAIN LANGUAGE SIGNAL MAP
// ============================================================================

function getPlainReasons(assessment) {
  const reasons = [];
  const signals = assessment?.signals || {};
  const triggeredRules = assessment?.triggeredRules || [];

  // Entry method
  const entry = signals.entry_method;
  if (entry?.riskPoints > 0) {
    const labels = { manual: 'Manual card entry', keyed: 'Manual card entry', moto: 'Phone/mail order', swipe: 'Magnetic stripe fallback', fallback_swipe: 'Magnetic stripe fallback' };
    reasons.push(labels[entry.method] || `${entry.method} entry method`);
  }

  // Velocity
  if (signals.velocity) {
    for (const [dim, v] of Object.entries(signals.velocity)) {
      if (v.exceeded) {
        if (dim === 'card') reasons.push(`Card used ${v.count} times in 5 minutes`);
        else if (dim === 'terminal') reasons.push(`${v.count} rapid transactions on this terminal`);
        else if (dim === 'decline') reasons.push(`${v.count} declines on this card in 10 minutes`);
        else reasons.push(`High ${dim} velocity (${v.count})`);
      }
    }
  }

  // BIN risk
  const bin = signals.bin_risk;
  if (bin?.riskPoints > 0) {
    const flags = bin.flags || [];
    if (flags.includes('prepaid_card')) reasons.push('Prepaid card detected');
    if (flags.includes('foreign_card')) reasons.push('Foreign-issued card');
  }

  // Amount anomaly
  if (signals.amount_anomaly?.riskPoints > 0) reasons.push('Transaction amount is unusually high');

  // Customer
  const cust = signals.customer_anomaly || signals.customer_history;
  if (cust?.chargebackCount > 0) reasons.push(`${cust.chargebackCount} previous chargeback(s)`);
  if (cust?.reason === 'high_value_no_customer') reasons.push('High-value sale with no customer on file');
  if (cust?.flags?.includes('new_customer_high_value')) reasons.push('First-time customer, high-value purchase');

  // Patterns
  if (signals.split_transaction?.riskPoints > 0) reasons.push('Possible split transaction pattern');
  if (signals.card_testing?.riskPoints > 0) reasons.push('Card testing pattern detected');
  if (signals.geographic_anomaly?.riskPoints > 0) reasons.push(`Card used ${signals.geographic_anomaly.distanceKm}km away recently`);
  if (signals.decline_pattern?.riskPoints > 0) reasons.push('Suspicious decline pattern');

  // Employee risk
  if (signals.employee_risk?.riskPoints > 0) reasons.push(`Employee risk level: ${signals.employee_risk.riskLevel}`);

  // Time
  if (signals.time_anomaly?.riskPoints > 0) reasons.push('Transaction outside business hours');

  // Fallback if no signals parsed
  if (reasons.length === 0) {
    for (const rule of triggeredRules) {
      reasons.push(rule.rule_name || rule.rule_code || 'Fraud rule triggered');
    }
  }

  return reasons.length > 0 ? reasons : ['Multiple fraud signals detected'];
}

// ============================================================================
// CODE 10 INSTRUCTIONS PANEL
// ============================================================================

function Code10Panel({ onClose }) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <Phone className="w-5 h-5 text-red-700" />
        <h4 className="text-sm font-bold text-red-800">Code 10 Authorization Request</h4>
      </div>
      <ol className="space-y-2 text-sm text-red-700 list-decimal list-inside">
        <li>Call Moneris authorization center at <span className="font-semibold">1-866-319-7450</span></li>
        <li>State: &ldquo;I have a <span className="font-semibold">Code 10</span> Authorization Request.&rdquo;</li>
        <li>Answer their yes/no questions calmly</li>
        <li className="font-semibold">Do NOT confront the customer</li>
        <li>Follow the operator&rsquo;s instructions</li>
      </ol>
      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full text-center text-xs text-red-600 hover:text-red-800 font-medium"
      >
        Close instructions
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Fraud blocked modal
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {object} props.assessment - Fraud assessment from backend (includes signals)
 * @param {function} props.onOverride - Callback when manager overrides the block
 * @param {function} props.onCancel - Callback to cancel the transaction
 * @param {function} [props.onTryAlternative] - Callback to go back to payment method selection
 */
export default function FraudBlockedModal({ isOpen, assessment, onOverride, onCancel, onTryAlternative, onVerifyPin }) {
  const [showManagerApproval, setShowManagerApproval] = useState(false);
  const [showCode10, setShowCode10] = useState(false);
  const [approvalResult, setApprovalResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowManagerApproval(false);
      setShowCode10(false);
      setApprovalResult(null);
      setVerifyError(null);
      setVerifyLoading(false);
    }
  }, [isOpen]);

  if (!isOpen || !assessment) return null;

  const reasons = getPlainReasons(assessment);

  if (showManagerApproval) {
    return (
      <ManagerApprovalModal
        isOpen={true}
        pendingOverride={{
          type: 'fraud_override',
          value: assessment.riskScore,
          threshold: 80,
          overrideType: 'fraud_block',
          description: `Fraud block override (Risk: ${assessment.riskScore}/100)`,
          signals: assessment.signals,
          triggeredRules: assessment.triggeredRules,
        }}
        onVerifyPin={async (pin, extraData) => {
          if (!onVerifyPin) return { approved: false, error: 'PIN verification not available' };
          setVerifyLoading(true);
          setVerifyError(null);
          try {
            const result = await onVerifyPin(pin, extraData);
            if (result?.approved) {
              setApprovalResult(result);
              setTimeout(() => onOverride?.(result), 1500);
            }
            return result;
          } catch (err) {
            const errMsg = err.message || 'Verification failed';
            setVerifyError(errMsg);
            return { approved: false, error: errMsg };
          } finally {
            setVerifyLoading(false);
          }
        }}
        onCancel={() => setShowManagerApproval(false)}
        isLoading={verifyLoading}
        error={verifyError}
        approvalResult={approvalResult}
        onClearError={() => setVerifyError(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Red gradient header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Transaction Blocked</h2>
              <p className="text-red-100 text-sm">Fraud prevention system activated</p>
            </div>
            <span className="ml-auto bg-white/20 text-white text-lg font-bold px-3 py-1 rounded-lg">
              {assessment.riskScore}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Plain-language reasons */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              This transaction was blocked because:
            </h3>
            <div className="space-y-2">
              {reasons.map((reason, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg border border-red-100">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-800">{reason}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Code 10 instructions */}
          {showCode10 && (
            <Code10Panel onClose={() => setShowCode10(false)} />
          )}

          {/* Alert ID */}
          {assessment.alertId && (
            <p className="text-xs text-gray-400">Alert ID: {assessment.alertId}</p>
          )}

          {/* Actions — 3 buttons + Code 10 */}
          <div className="space-y-2">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors text-sm"
              >
                Cancel Transaction
              </button>
              <button
                type="button"
                onClick={() => setShowManagerApproval(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl transition-colors text-sm"
              >
                <Lock className="w-4 h-4" />
                Manager Override
              </button>
            </div>

            <div className="flex gap-3">
              {onTryAlternative && (
                <button
                  type="button"
                  onClick={onTryAlternative}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-xl border border-blue-200 transition-colors text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Alternative Payment
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCode10(!showCode10)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium rounded-xl border transition-colors text-sm ${
                  showCode10
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600'
                }`}
              >
                <Phone className="w-4 h-4" />
                Code 10
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
