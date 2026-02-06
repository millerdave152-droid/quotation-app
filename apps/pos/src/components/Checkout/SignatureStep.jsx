/**
 * TeleTime POS - Signature Step Component
 * Handles signature collection during checkout flow
 */

import { useState, useCallback } from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  PencilSquareIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
} from '@heroicons/react/24/outline';
import { SignaturePad } from '../Signature';

/**
 * Signature requirement card
 */
function SignatureRequirementCard({
  requirement,
  status, // 'pending', 'captured', 'deferred'
  signatureData,
  onCapture,
  onDefer,
  onRecapture,
  isActive,
}) {
  const statusColors = {
    pending: 'border-gray-200 bg-white',
    captured: 'border-green-200 bg-green-50',
    deferred: 'border-amber-200 bg-amber-50',
  };

  const statusIcons = {
    pending: null,
    captured: <CheckCircleIcon className="w-5 h-5 text-green-600" />,
    deferred: <ClockIcon className="w-5 h-5 text-amber-600" />,
  };

  return (
    <div className={`rounded-xl border-2 p-4 transition-all ${statusColors[status]} ${isActive ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {statusIcons[status]}
            <h3 className="font-semibold text-gray-900">{requirement.title}</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">{requirement.subtitle}</p>

          {/* Status-specific content */}
          {status === 'captured' && signatureData && (
            <div className="mt-3 flex items-center gap-3">
              <div className="text-sm">
                <span className="text-gray-500">Signed by:</span>{' '}
                <span className="font-medium text-gray-900">{signatureData.signerName}</span>
              </div>
              <button
                type="button"
                onClick={onRecapture}
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
              >
                Re-sign
              </button>
            </div>
          )}

          {status === 'deferred' && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700">
              <ClockIcon className="w-4 h-4" />
              <span>Will be captured upon delivery</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {status === 'pending' && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onCapture}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <PencilSquareIcon className="w-4 h-4" />
              Sign Now
            </button>
            {requirement.canDefer && (
              <button
                type="button"
                onClick={onDefer}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                {requirement.deferLabel || 'Sign Later'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Signature Step Component
 * @param {object} props
 * @param {Array} props.requirements - Required signatures
 * @param {object} props.capturedSignatures - Already captured signatures
 * @param {object} props.deferredSignatures - Deferred signatures
 * @param {function} props.onSignatureCapture - Called when signature is captured
 * @param {function} props.onSignatureDefer - Called when signature is deferred
 * @param {function} props.onComplete - Called when all signatures are handled
 * @param {function} props.onBack - Called to go back
 * @param {object} props.orderInfo - Order information for context
 */
export default function SignatureStep({
  requirements = [],
  capturedSignatures = {},
  deferredSignatures = {},
  onSignatureCapture,
  onSignatureDefer,
  onComplete,
  onBack,
  orderInfo,
}) {
  const [activeCapture, setActiveCapture] = useState(null);

  // Get status for each requirement
  const getStatus = useCallback((type) => {
    if (capturedSignatures[type]) return 'captured';
    if (deferredSignatures[type]) return 'deferred';
    return 'pending';
  }, [capturedSignatures, deferredSignatures]);

  // Check if all requirements are handled
  const allHandled = requirements.every(req =>
    capturedSignatures[req.type] || deferredSignatures[req.type]
  );

  // Handle signature capture
  const handleCapture = useCallback((requirement) => {
    setActiveCapture(requirement);
  }, []);

  // Handle signature accepted from pad
  const handleSignatureAccepted = useCallback((signatureData) => {
    if (activeCapture) {
      onSignatureCapture?.(activeCapture.type, signatureData);
      setActiveCapture(null);
    }
  }, [activeCapture, onSignatureCapture]);

  // Handle signature cancel
  const handleSignatureCancel = useCallback(() => {
    setActiveCapture(null);
  }, []);

  // Handle defer
  const handleDefer = useCallback((type) => {
    onSignatureDefer?.(type);
  }, [onSignatureDefer]);

  // Handle re-capture
  const handleRecapture = useCallback((requirement) => {
    setActiveCapture(requirement);
  }, []);

  // If actively capturing, show the signature pad
  if (activeCapture) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <button
            type="button"
            onClick={handleSignatureCancel}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">
            {activeCapture.title}
          </h2>
        </div>

        {/* Signature Pad */}
        <div className="flex-1 overflow-y-auto">
          <SignaturePad
            title={activeCapture.title}
            subtitle={activeCapture.subtitle}
            legalText={activeCapture.legalText}
            requirePrintedName={true}
            outputFormat="svg"
            onAccept={handleSignatureAccepted}
            onCancel={handleSignatureCancel}
          />
        </div>
      </div>
    );
  }

  // Show requirement list
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Signature Required</h2>
        <p className="text-gray-500 mt-1">
          Please complete the following signature{requirements.length > 1 ? 's' : ''} to proceed
        </p>
      </div>

      {/* Order Info Summary */}
      {orderInfo && (
        <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-slate-500">Order Total</p>
              <p className="text-lg font-bold text-slate-900">
                ${orderInfo.total?.toFixed(2) || '0.00'}
              </p>
            </div>
            {orderInfo.fulfillmentType && (
              <div className="text-right">
                <p className="text-slate-500">Fulfillment</p>
                <p className="font-medium text-slate-900 capitalize">
                  {orderInfo.fulfillmentType.replace(/_/g, ' ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Requirements List */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {requirements.map((requirement, index) => (
          <SignatureRequirementCard
            key={requirement.type}
            requirement={requirement}
            status={getStatus(requirement.type)}
            signatureData={capturedSignatures[requirement.type]}
            onCapture={() => handleCapture(requirement)}
            onDefer={() => handleDefer(requirement.type)}
            onRecapture={() => handleRecapture(requirement)}
            isActive={false}
          />
        ))}
      </div>

      {/* Progress Summary */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm mb-4">
          <span className="text-gray-500">
            {Object.keys(capturedSignatures).length} of {requirements.length} signed
          </span>
          {Object.keys(deferredSignatures).length > 0 && (
            <span className="text-amber-600">
              {Object.keys(deferredSignatures).length} deferred
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex-1 h-12 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5" />
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onComplete}
            disabled={!allHandled}
            className={`flex-1 h-12 flex items-center justify-center gap-2 font-bold rounded-xl transition-colors ${
              allHandled
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Continue
            <ArrowRightIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
