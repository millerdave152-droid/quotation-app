/**
 * TeleTime POS - Customer Badge Component
 * Shows attached customer info with quick actions
 */

import { useState } from 'react';
import { XMarkIcon, UserIcon, PhoneIcon } from '@heroicons/react/24/outline';
import { formatPhone } from '../../utils/formatters';

/**
 * Customer badge component
 * @param {object} props
 * @param {object} props.customer - Customer data
 * @param {string|number} props.quoteId - Quote ID if loaded from quote
 * @param {string} props.quoteNumber - Quote number for display
 * @param {function} props.onRemove - Callback to remove customer
 * @param {function} props.onClick - Callback when badge is clicked
 * @param {string} props.className - Additional CSS classes
 */
export function CustomerBadge({
  customer,
  quoteId,
  quoteNumber,
  onRemove,
  onClick,
  className = '',
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (!customer) return null;

  // Extract customer data (handle different field naming)
  const customerId = customer.customerId || customer.customer_id || customer.id;
  const customerName =
    customer.customerName ||
    customer.customer_name ||
    customer.name ||
    `${customer.firstName || customer.first_name || ''} ${
      customer.lastName || customer.last_name || ''
    }`.trim();
  const phone = customer.phone || customer.phoneNumber || customer.phone_number;
  const email = customer.email;

  const handleClick = () => {
    if (onClick) {
      onClick(customer);
    } else {
      setShowDetails(!showDetails);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    onRemove?.();
  };

  return (
    <div className={`relative ${className}`}>
      {/* Main Badge */}
      <div
        onClick={handleClick}
        className="
          flex items-center gap-3
          p-3
          bg-blue-50 border border-blue-200
          rounded-lg
          cursor-pointer
          hover:bg-blue-100
          transition-colors duration-150
        "
      >
        {/* Customer Icon */}
        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          <UserIcon className="w-5 h-5 text-white" />
        </div>

        {/* Customer Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 truncate">
            {customerName}
          </h4>
          {phone && (
            <p className="text-xs text-gray-600 flex items-center gap-1">
              <PhoneIcon className="w-3 h-3" />
              {formatPhone(phone)}
            </p>
          )}
          {quoteId && (
            <p className="text-xs text-blue-600 font-medium mt-0.5">
              From Quote #{quoteNumber || quoteId}
            </p>
          )}
        </div>

        {/* Remove Button */}
        <button
          type="button"
          onClick={handleRemove}
          className="
            w-8 h-8
            flex items-center justify-center
            text-gray-400 hover:text-red-500
            hover:bg-red-50
            rounded-full
            transition-colors duration-150
          "
          aria-label="Remove customer"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Expanded Details (inline) */}
      {showDetails && (
        <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Customer ID</span>
              <span className="font-medium">{customerId}</span>
            </div>
            {email && (
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium truncate ml-2">{email}</span>
              </div>
            )}
            {phone && (
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="font-medium">{formatPhone(phone)}</span>
              </div>
            )}
            {customer.address && (
              <div className="flex justify-between">
                <span className="text-gray-500">Address</span>
                <span className="font-medium text-right ml-2 truncate">
                  {customer.address}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerBadge;
