/**
 * TeleTime POS - Financing Approval Result Component
 * Displays approval status and next steps
 */

import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  DocumentTextIcon,
  PhoneIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Status badge with animation
 */
function StatusBadge({ status }) {
  const statusConfig = {
    approved: {
      bg: 'bg-green-100',
      icon: CheckCircleIcon,
      iconColor: 'text-green-600',
      animate: true,
    },
    declined: {
      bg: 'bg-red-100',
      icon: XCircleIcon,
      iconColor: 'text-red-600',
      animate: false,
    },
    pending: {
      bg: 'bg-yellow-100',
      icon: ClockIcon,
      iconColor: 'text-yellow-600',
      animate: true,
    },
    more_info: {
      bg: 'bg-orange-100',
      icon: ExclamationTriangleIcon,
      iconColor: 'text-orange-600',
      animate: false,
    },
    error: {
      bg: 'bg-red-100',
      icon: XCircleIcon,
      iconColor: 'text-red-600',
      animate: false,
    },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <div className={`
      w-24 h-24 rounded-full flex items-center justify-center
      ${config.bg}
      ${config.animate ? 'animate-pulse' : ''}
    `}>
      <Icon className={`w-14 h-14 ${config.iconColor}`} />
    </div>
  );
}

/**
 * Agreement details card
 */
function AgreementDetails({ agreement, paymentPlan }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left">
      <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
        <DocumentTextIcon className="w-5 h-5" />
        Financing Agreement
      </h4>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Agreement Number</span>
          <span className="font-mono font-medium text-gray-900">
            {agreement?.agreementNumber || 'Pending'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Financed Amount</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {formatCurrency(paymentPlan?.principal || 0)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Monthly Payment</span>
          <span className="font-bold text-green-700 tabular-nums">
            {formatCurrency(agreement?.monthlyPayment || paymentPlan?.monthlyPayment || 0)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Term</span>
          <span className="font-medium text-gray-900">
            {paymentPlan?.termMonths || 0} months
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">APR</span>
          <span className={`font-medium ${paymentPlan?.apr === 0 ? 'text-green-600' : 'text-gray-900'}`}>
            {paymentPlan?.apr === 0 ? '0% (Promotional)' : `${paymentPlan?.apr}%`}
          </span>
        </div>
        <div className="border-t border-green-200 pt-2 mt-2">
          <div className="flex justify-between">
            <span className="text-gray-600">First Payment Due</span>
            <span className="font-medium text-gray-900">
              {formatDate(agreement?.firstPaymentDate || paymentPlan?.firstPaymentDate)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * External provider redirect
 */
function ExternalRedirect({ application }) {
  const providerInfo = {
    affirm: {
      name: 'Affirm',
      color: 'blue',
      instructions: 'Complete your application to get an instant decision.',
    },
    klarna: {
      name: 'Klarna',
      color: 'pink',
      instructions: 'Finish your application for instant approval.',
    },
    synchrony: {
      name: 'Synchrony',
      color: 'purple',
      instructions: 'Apply for your Synchrony credit account.',
    },
  };

  const info = providerInfo[application?.provider] || {
    name: application?.provider || 'Provider',
    color: 'gray',
    instructions: 'Complete your application with the financing provider.',
  };

  return (
    <div className="text-center space-y-4">
      <p className="text-gray-600">{info.instructions}</p>

      {application?.redirectUrl && (
        <a
          href={application.redirectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          Continue to {info.name}
          <ArrowRightIcon className="w-5 h-5" />
        </a>
      )}

      <p className="text-sm text-gray-500">
        Application ID: {application?.applicationNumber}
      </p>
    </div>
  );
}

/**
 * Financing approval result component
 * @param {object} props
 * @param {string} props.status - Approval status
 * @param {string} props.message - Status message
 * @param {object} props.application - Application data
 * @param {object} props.agreement - Agreement data (if approved)
 * @param {object} props.paymentPlan - Payment plan details
 * @param {function} props.onContinue - Continue to terms acceptance
 * @param {function} props.onTryAgain - Try different plan
 * @param {function} props.onCancel - Cancel financing
 */
export function FinancingApprovalResult({
  status,
  message,
  application,
  agreement,
  paymentPlan,
  onContinue,
  onTryAgain,
  onCancel,
}) {
  const statusTitles = {
    approved: 'Financing Approved!',
    declined: 'Application Declined',
    pending: 'Application Pending',
    more_info: 'Additional Information Required',
    error: 'Application Error',
  };

  const statusDescriptions = {
    approved: 'Your financing has been approved. Review the details below and continue to accept the terms.',
    declined: message || 'We were unable to approve your financing application at this time.',
    pending: 'Your application is being reviewed. You will be notified once a decision is made.',
    more_info: 'We need additional information to process your application.',
    error: message || 'An error occurred while processing your application.',
  };

  const isExternal = application?.requiresRedirect;

  return (
    <div className="flex flex-col items-center text-center py-4">
      {/* Status Badge */}
      <StatusBadge status={status} />

      {/* Title */}
      <h2 className="text-2xl font-bold text-gray-900 mt-6 mb-2">
        {statusTitles[status] || 'Processing'}
      </h2>

      {/* Description */}
      <p className="text-gray-600 max-w-md mb-6">
        {statusDescriptions[status]}
      </p>

      {/* Content based on status */}
      <div className="w-full max-w-md space-y-4">
        {/* Approved - Show agreement details */}
        {status === 'approved' && !isExternal && (
          <>
            <AgreementDetails agreement={agreement} paymentPlan={paymentPlan} />

            <button
              type="button"
              onClick={onContinue}
              className="w-full h-14 bg-green-600 hover:bg-green-700 text-white text-lg font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <DocumentTextIcon className="w-6 h-6" />
              Accept Terms & Sign
            </button>
          </>
        )}

        {/* External provider - Show redirect */}
        {(status === 'pending' || status === 'approved') && isExternal && (
          <ExternalRedirect application={application} />
        )}

        {/* Declined - Options */}
        {status === 'declined' && (
          <>
            {/* Decline details */}
            {application?.declineCode && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-left">
                <p className="text-sm text-red-700">
                  <strong>Reason:</strong> {message}
                </p>
                {application?.declineCode && (
                  <p className="text-xs text-red-500 mt-1">
                    Code: {application.declineCode}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onTryAgain}
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
              >
                Try Different Plan
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-12 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Other Payment
              </button>
            </div>
          </>
        )}

        {/* Pending (non-external) - Wait message */}
        {status === 'pending' && !isExternal && (
          <>
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-700">
                We'll notify you when your application has been reviewed.
                This usually takes 1-2 business days.
              </p>
            </div>

            <p className="text-sm text-gray-500">
              Application ID: {application?.applicationNumber}
            </p>

            <button
              type="button"
              onClick={onCancel}
              className="w-full h-12 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Choose Different Payment
            </button>
          </>
        )}

        {/* More Info Required */}
        {status === 'more_info' && (
          <>
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-left">
              <p className="text-sm text-orange-700 mb-2">
                Please provide the following:
              </p>
              <ul className="text-sm text-orange-600 list-disc list-inside space-y-1">
                <li>Valid government-issued ID</li>
                <li>Proof of income or employment</li>
                <li>Additional contact information</li>
              </ul>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <PhoneIcon className="w-4 h-4" />
              <span>Need help? Contact a manager</span>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onTryAgain}
                className="flex-1 h-12 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Try Different Plan
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-12 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onTryAgain}
              className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-12 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default FinancingApprovalResult;
