/**
 * TeleTime POS - Fraud Blocked Modal
 * Blocking modal shown when risk score >= 80.
 * Requires manager PIN override to proceed or cancel the transaction.
 */

import { useState, useEffect } from 'react';
import {
  ShieldExclamationIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { ManagerApprovalModal } from './ManagerApprovalModal';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Fraud blocked modal
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {object} props.assessment - Fraud assessment from backend
 * @param {function} props.onOverride - Callback when manager overrides the block
 * @param {function} props.onCancel - Callback to cancel the transaction
 */
export default function FraudBlockedModal({ isOpen, assessment, onOverride, onCancel }) {
  const [showManagerApproval, setShowManagerApproval] = useState(false);

  useEffect(() => {
    if (!isOpen) setShowManagerApproval(false);
  }, [isOpen]);

  if (!isOpen || !assessment) return null;

  const triggeredRules = assessment.triggeredRules || [];

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
        }}
        onVerifyPin={async (pin) => {
          // The ManagerApprovalModal handles PIN verification
          // If successful, it calls onVerifyPin with the result
          return { success: true };
        }}
        onCancel={() => setShowManagerApproval(false)}
        approvalResult={null}
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
              <ShieldExclamationIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Transaction Blocked</h2>
              <p className="text-red-100 text-sm">Fraud detection triggered</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {/* Risk score */}
          <div className="flex items-center justify-between mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
            <span className="text-sm font-medium text-red-800">Risk Score</span>
            <span className="text-2xl font-bold text-red-700">{assessment.riskScore}/100</span>
          </div>

          {/* Triggered rules */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Triggered Rules:</h3>
            <div className="space-y-2">
              {triggeredRules.map((rule, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                  <ExclamationTriangleIcon className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{rule.rule_name}</p>
                    <p className="text-xs text-gray-500">
                      {rule.severity} &middot; +{rule.risk_points} pts
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alert ID */}
          {assessment.alertId && (
            <p className="text-xs text-gray-400 mb-4">Alert ID: {assessment.alertId}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              Cancel Transaction
            </button>
            <button
              type="button"
              onClick={() => setShowManagerApproval(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl transition-colors"
            >
              <LockClosedIcon className="w-4 h-4" />
              Manager Override
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
