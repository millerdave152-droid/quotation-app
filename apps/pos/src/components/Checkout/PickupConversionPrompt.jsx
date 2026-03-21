/**
 * TeleTime POS - Pickup Conversion Prompt
 *
 * Displayed when a MOTO order is marked for in-store pickup.
 * Prompts the employee to:
 * 1. Convert to chip-and-PIN transaction (preferred)
 * 2. If customer can't present card, require photo ID + signed authorization
 */

import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';
import { AlertTriangle, CreditCard, IdCard, ShieldCheck } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('pos_token') || localStorage.getItem('auth_token') || '';
}

export default function PickupConversionPrompt({ motoOrder, onConvert, onVerified, onCancel }) {
  const [mode, setMode] = useState('prompt'); // prompt | id_verify
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  // ID verification fields
  const [idVerified, setIdVerified] = useState(false);
  const [idType, setIdType] = useState('drivers_license');
  const [authSigned, setAuthSigned] = useState(false);

  const handleConvertToChip = async () => {
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/moto/pickup-convert/${motoOrder.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ convertToChip: true }),
      });
      const data = await res.json();
      if (data.success) {
        onConvert?.(data.data);
      } else {
        setError(data.error || 'Failed to void MOTO authorization');
      }
    } catch {
      setError('Network error during pickup conversion');
    }
    setProcessing(false);
  };

  const handleIdVerification = async () => {
    if (!idVerified || !authSigned) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/moto/pickup-convert/${motoOrder.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          convertToChip: false,
          idVerified: true,
          idType,
          authorizationSigned: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onVerified?.(data.data);
      } else {
        setError(data.error || 'ID verification failed');
      }
    } catch {
      setError('Network error during ID verification');
    }
    setProcessing(false);
  };

  if (mode === 'id_verify') {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 mb-4">
          <div className="flex items-start gap-3">
            <IdCard className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-amber-800 mb-1">
                ID Verification Required
              </h3>
              <p className="text-sm text-amber-700 mb-3">
                Customer cannot present their card. The following verification is required:
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Order details */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Order Name</span>
              <span className="font-medium">{motoOrder.cardholder_name}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Amount</span>
              <span className="font-medium">{formatCurrency(motoOrder.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Card</span>
              <span className="font-medium">****{motoOrder.card_last_four}</span>
            </div>
          </div>

          {/* ID Type */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Photo ID Type</label>
            <select value={idType} onChange={e => setIdType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="drivers_license">Driver's License</option>
              <option value="passport">Passport</option>
              <option value="provincial_id">Provincial ID Card</option>
              <option value="other">Other Government ID</option>
            </select>
          </div>

          {/* Checkboxes */}
          <label className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={idVerified} onChange={e => setIdVerified(e.target.checked)}
              className="mt-0.5 rounded" />
            <div>
              <p className="text-sm font-medium text-gray-800">Photo ID matches order name</p>
              <p className="text-xs text-gray-500">I have verified the person's photo ID matches "{motoOrder.cardholder_name}"</p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={authSigned} onChange={e => setAuthSigned(e.target.checked)}
              className="mt-0.5 rounded" />
            <div>
              <p className="text-sm font-medium text-gray-800">Pickup authorization form signed</p>
              <p className="text-xs text-gray-500">The person picking up has signed the pickup authorization form</p>
            </div>
          </label>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={() => setMode('prompt')} className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300">
            Back
          </button>
          <button
            onClick={handleIdVerification}
            disabled={processing || !idVerified || !authSigned}
            className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-50"
          >
            {processing ? 'Verifying...' : 'Confirm Pickup'}
          </button>
        </div>
      </div>
    );
  }

  // Main prompt screen
  return (
    <div className="p-6">
      <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-5 mb-5">
        <div className="flex items-start gap-3">
          <CreditCard className="w-8 h-8 text-blue-600 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-bold text-blue-900 mb-1">
              CONVERT TO CHIP
            </h3>
            <p className="text-sm text-blue-800 mb-2">
              This phone order should be re-processed as a <strong>chip-and-PIN transaction</strong> for fraud protection.
              Ask the customer to present their card.
            </p>
            <div className="bg-white rounded-lg p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Cardholder</span>
                <span className="font-medium">{motoOrder.cardholder_name}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Amount</span>
                <span className="font-bold text-lg">{formatCurrency(motoOrder.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Card</span>
                <span className="font-medium">{motoOrder.card_brand} ****{motoOrder.card_last_four}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3">
        {/* Primary: Convert to chip */}
        <button
          onClick={handleConvertToChip}
          disabled={processing}
          className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-6 h-6" />
          {processing ? 'Voiding MOTO...' : 'Process as Chip'}
        </button>

        {/* Secondary: Customer can't present card */}
        <button
          onClick={() => setMode('id_verify')}
          disabled={processing}
          className="w-full py-3 bg-amber-100 text-amber-800 rounded-xl font-semibold hover:bg-amber-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <AlertTriangle className="w-5 h-5" />
          Customer Cannot Present Card
        </button>

        {/* Tertiary: Cancel */}
        <button onClick={onCancel} disabled={processing}
          className="w-full py-2 text-gray-500 text-sm hover:text-gray-700">
          Skip for now
        </button>
      </div>
    </div>
  );
}
