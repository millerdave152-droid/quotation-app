/**
 * TeleTime POS - Signature Modal Component
 * Full-screen modal wrapper for signature capture
 */

import { useEffect, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import SignaturePad from './SignaturePad';

/**
 * Signature Modal Component
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Callback when modal closes
 * @param {function} props.onAccept - Callback when signature is accepted
 * @param {string} props.signatureType - Type: 'delivery', 'purchase', 'trade_in', 'financing'
 * @param {string} props.title - Modal title
 * @param {string} props.subtitle - Modal subtitle
 * @param {string} props.legalText - Legal text to display
 * @param {boolean} props.requirePrintedName - Whether to require printed name
 * @param {object} props.orderInfo - Optional order info to display
 */
export default function SignatureModal({
  isOpen,
  onClose,
  onAccept,
  signatureType = 'delivery',
  title,
  subtitle,
  legalText,
  requirePrintedName = true,
  orderInfo,
  termsVersion,
}) {
  // Default titles based on signature type
  const defaultTitles = {
    delivery: 'Delivery Confirmation',
    purchase: 'Purchase Acknowledgment',
    trade_in: 'Trade-In Agreement',
    financing: 'Financing Agreement',
    refund: 'Refund Acknowledgment',
  };

  const defaultSubtitles = {
    delivery: 'Please sign to confirm receipt of your order',
    purchase: 'Please sign to acknowledge this purchase',
    trade_in: 'Please sign to confirm trade-in acceptance and ownership transfer',
    financing: 'Please sign to accept the financing terms',
    refund: 'Please sign to acknowledge the refund terms',
  };

  const displayTitle = title || defaultTitles[signatureType] || 'Signature Required';
  const displaySubtitle = subtitle || defaultSubtitles[signatureType] || 'Please sign below';

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Handle signature acceptance
  const handleAccept = useCallback((signatureData) => {
    onAccept?.({
      ...signatureData,
      signatureType,
      termsVersion,
      legalText,
      orderInfo,
    });
  }, [onAccept, signatureType, termsVersion, legalText, orderInfo]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col mx-4">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        {/* Order Info Banner */}
        {orderInfo && (
          <div className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Order</p>
              <p className="font-mono font-semibold">{orderInfo.orderNumber}</p>
            </div>
            {orderInfo.customerName && (
              <div className="text-right">
                <p className="text-sm text-slate-300">Customer</p>
                <p className="font-medium">{orderInfo.customerName}</p>
              </div>
            )}
            {orderInfo.total && (
              <div className="text-right">
                <p className="text-sm text-slate-300">Total</p>
                <p className="font-bold text-lg">${orderInfo.total.toFixed(2)}</p>
              </div>
            )}
          </div>
        )}

        {/* Signature Pad */}
        <div className="flex-1 overflow-y-auto p-6">
          <SignaturePad
            title={displayTitle}
            subtitle={displaySubtitle}
            legalText={legalText}
            requirePrintedName={requirePrintedName}
            onAccept={handleAccept}
            onCancel={onClose}
            outputFormat="svg"
          />
        </div>

        {/* Terms Version Footer */}
        {termsVersion && (
          <div className="px-6 py-2 bg-gray-50 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400">
              Terms Version: {termsVersion}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
