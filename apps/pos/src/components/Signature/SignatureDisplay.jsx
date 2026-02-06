/**
 * TeleTime POS - Signature Display Component
 * Display captured signatures with metadata
 */

import {
  CheckBadgeIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';
import { sanitizeSvg } from '../../utils/sanitize';

/**
 * Signature type badges
 */
const TYPE_BADGES = {
  delivery: { label: 'Delivery', color: 'bg-blue-100 text-blue-700' },
  purchase: { label: 'Purchase', color: 'bg-green-100 text-green-700' },
  trade_in: { label: 'Trade-In', color: 'bg-purple-100 text-purple-700' },
  financing: { label: 'Financing', color: 'bg-orange-100 text-orange-700' },
  refund: { label: 'Refund', color: 'bg-red-100 text-red-700' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-700' },
};

/**
 * Status badges
 */
const STATUS_BADGES = {
  valid: { label: 'Valid', color: 'text-green-600', icon: CheckBadgeIcon },
  voided: { label: 'Voided', color: 'text-red-600', icon: XCircleIcon },
  superseded: { label: 'Superseded', color: 'text-yellow-600', icon: ClockIcon },
};

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Signature Display Component
 * @param {object} props
 * @param {object} props.signature - Signature data object
 * @param {string} props.size - Display size: 'sm', 'md', 'lg'
 * @param {boolean} props.showMetadata - Show capture metadata
 * @param {boolean} props.showLegalText - Show legal text that was signed
 * @param {function} props.onVoid - Callback to void signature
 */
export function SignatureDisplay({
  signature,
  size = 'md',
  showMetadata = true,
  showLegalText = false,
  onVoid,
  className = '',
}) {
  if (!signature) {
    return (
      <div className={`bg-gray-50 rounded-lg p-4 text-center text-gray-400 ${className}`}>
        No signature captured
      </div>
    );
  }

  const typeBadge = TYPE_BADGES[signature.signatureType] || TYPE_BADGES.other;
  const statusBadge = STATUS_BADGES[signature.status] || STATUS_BADGES.valid;
  const StatusIcon = statusBadge.icon;

  const sizeClasses = {
    sm: 'max-w-[200px] max-h-[80px]',
    md: 'max-w-[300px] max-h-[120px]',
    lg: 'max-w-[400px] max-h-[160px]',
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${typeBadge.color}`}>
            {typeBadge.label}
          </span>
          <span className={`flex items-center gap-1 text-xs ${statusBadge.color}`}>
            <StatusIcon className="w-4 h-4" />
            {statusBadge.label}
          </span>
        </div>
        {signature.termsVersion && (
          <span className="text-xs text-gray-400">
            v{signature.termsVersion}
          </span>
        )}
      </div>

      {/* Signature Image */}
      <div className="p-4 flex justify-center bg-white">
        {signature.signatureData?.startsWith('data:image/svg') ? (
          <div
            className={sizeClasses[size]}
            dangerouslySetInnerHTML={{
              // Sanitize SVG to prevent XSS attacks
              __html: sanitizeSvg(atob(signature.signatureData.split(',')[1]))
            }}
          />
        ) : signature.signatureData ? (
          <img
            src={signature.signatureData}
            alt="Signature"
            className={sizeClasses[size]}
          />
        ) : (
          <div className="text-gray-400 py-4">Signature data unavailable</div>
        )}
      </div>

      {/* Signer Info */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">{signature.signerName}</p>
            {signature.signerEmail && (
              <p className="text-xs text-gray-500">{signature.signerEmail}</p>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {formatDate(signature.capturedAt)}
          </p>
        </div>
      </div>

      {/* Metadata */}
      {showMetadata && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 space-y-2">
          {signature.capturedByName && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <UserIcon className="w-4 h-4" />
              <span>Captured by: {signature.capturedByName}</span>
            </div>
          )}
          {signature.deviceInfo?.deviceType && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <DevicePhoneMobileIcon className="w-4 h-4" />
              <span>Device: {signature.deviceInfo.deviceType}</span>
            </div>
          )}
          {signature.ipAddress && (
            <div className="text-xs text-gray-400">
              IP: {signature.ipAddress}
            </div>
          )}
        </div>
      )}

      {/* Legal Text */}
      {showLegalText && signature.legalText && (
        <div className="px-4 py-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 font-medium mb-1">Terms Agreed</p>
          <p className="text-xs text-gray-600 whitespace-pre-line line-clamp-4">
            {signature.legalText}
          </p>
        </div>
      )}

      {/* Void Info */}
      {signature.status === 'voided' && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-200">
          <p className="text-xs text-red-600 font-medium">
            Voided: {formatDate(signature.voidedAt)}
          </p>
          {signature.voidedReason && (
            <p className="text-xs text-red-500 mt-1">{signature.voidedReason}</p>
          )}
        </div>
      )}

      {/* Void Action */}
      {onVoid && signature.status === 'valid' && (
        <div className="px-4 py-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => onVoid(signature.id)}
            className="text-xs text-red-600 hover:text-red-700 hover:underline"
          >
            Void Signature
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Signature List Component
 * Display multiple signatures for an order/transaction
 */
export function SignatureList({
  signatures = [],
  showMetadata = false,
  emptyMessage = 'No signatures captured',
  className = '',
}) {
  if (!signatures.length) {
    return (
      <div className={`bg-gray-50 rounded-lg p-6 text-center ${className}`}>
        <p className="text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {signatures.map((sig) => (
        <SignatureDisplay
          key={sig.id}
          signature={sig}
          size="sm"
          showMetadata={showMetadata}
        />
      ))}
    </div>
  );
}

/**
 * Inline Signature Preview
 * Compact signature display for tables/lists
 */
export function SignaturePreview({ signature, className = '' }) {
  if (!signature) {
    return (
      <span className="text-gray-400 text-sm">Not signed</span>
    );
  }

  const statusColors = {
    valid: 'text-green-600',
    voided: 'text-red-600 line-through',
    superseded: 'text-yellow-600',
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CheckBadgeIcon className={`w-4 h-4 ${statusColors[signature.status] || 'text-green-600'}`} />
      <span className={`text-sm ${statusColors[signature.status] || ''}`}>
        {signature.signerName}
      </span>
      <span className="text-xs text-gray-400">
        {formatDate(signature.capturedAt)}
      </span>
    </div>
  );
}

export default SignatureDisplay;
