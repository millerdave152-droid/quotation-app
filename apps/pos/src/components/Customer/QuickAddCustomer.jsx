/**
 * TeleTime POS - Quick Add Customer Component
 * Minimal form for quickly adding new customers
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ArrowLeftIcon,
  UserPlusIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { createCustomer } from '../../api/customers';
import MarketingAttributionSelector from './MarketingAttributionSelector';
import CommunicationPreferences from './CommunicationPreferences';

/**
 * Format phone number as user types
 * @param {string} value - Raw input value
 * @returns {string} Formatted phone number
 */
function formatPhoneInput(value) {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');

  // Format as (XXX) XXX-XXXX
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/**
 * Extract digits from formatted phone
 */
function extractPhoneDigits(formatted) {
  return formatted.replace(/\D/g, '');
}

/**
 * Quick add customer form
 * @param {object} props
 * @param {function} props.onComplete - Callback when customer is created
 * @param {function} props.onCancel - Callback to cancel/go back
 * @param {string} props.initialPhone - Initial phone value (from search)
 */
export function QuickAddCustomer({
  onComplete,
  onCancel,
  initialPhone = '',
}) {
  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState(formatPhoneInput(initialPhone));
  const [email, setEmail] = useState('');
  const [marketingSource, setMarketingSource] = useState(null);
  const [marketingSourceDetail, setMarketingSourceDetail] = useState(null);
  const [commPrefs, setCommPrefs] = useState({
    emailTransactional: true,
    emailMarketing: false,
    smsTransactional: false,
    smsMarketing: false,
  });

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const firstNameRef = useRef(null);

  // Focus first name on mount
  useEffect(() => {
    firstNameRef.current?.focus();
  }, []);

  // Handle phone input
  const handlePhoneChange = (e) => {
    const formatted = formatPhoneInput(e.target.value);
    setPhone(formatted);
    setError(null);
  };

  // Validate form
  const validateForm = () => {
    if (!firstName.trim()) {
      setError('First name is required');
      return false;
    }
    if (!lastName.trim()) {
      setError('Last name is required');
      return false;
    }
    if (!phone || extractPhoneDigits(phone).length < 10) {
      setError('Valid phone number is required');
      return false;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Invalid email format');
      return false;
    }
    return true;
  };

  // Handle submit
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const customerData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        phone: extractPhoneDigits(phone),
        email: email.trim() || null,
        marketingSource: marketingSource || null,
        marketingSourceDetail: marketingSourceDetail || null,
        emailTransactional: commPrefs.emailTransactional,
        emailMarketing: commPrefs.emailMarketing,
        smsTransactional: commPrefs.smsTransactional,
        smsMarketing: commPrefs.smsMarketing,
      };

      const result = await createCustomer(customerData);

      if (result.success) {
        setSuccess(true);

        // Brief success animation, then complete
        setTimeout(() => {
          onComplete?.(result.data);
        }, 800);
      } else {
        setError(result.error || 'Failed to create customer');
      }
    } catch (err) {
      console.error('[QuickAddCustomer] Create error:', err);
      setError(err.message || 'Failed to create customer');
    } finally {
      setIsSubmitting(false);
    }
  }, [firstName, lastName, phone, email, marketingSource, marketingSourceDetail, commPrefs, onComplete]);

  // Success state
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircleIcon className="w-12 h-12 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Customer Added!
        </h3>
        <p className="text-sm text-gray-500">
          Adding to cart...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="
            w-10 h-10
            flex items-center justify-center
            text-gray-500 hover:text-gray-700
            hover:bg-gray-100
            rounded-lg
            transition-colors duration-150
          "
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-900">New Customer</h2>
          <p className="text-sm text-gray-500">Quick add to cart</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 p-4 overflow-y-auto">
        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* First Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            ref={firstNameRef}
            type="text"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              setError(null);
            }}
            placeholder="John"
            className="
              w-full h-12 px-4
              text-base
              border-2 border-gray-200 rounded-xl
              focus:border-blue-500 focus:ring-2 focus:ring-blue-100
              transition-colors duration-150
            "
            autoComplete="given-name"
          />
        </div>

        {/* Last Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              setError(null);
            }}
            placeholder="Smith"
            className="
              w-full h-12 px-4
              text-base
              border-2 border-gray-200 rounded-xl
              focus:border-blue-500 focus:ring-2 focus:ring-blue-100
              transition-colors duration-150
            "
            autoComplete="family-name"
          />
        </div>

        {/* Phone */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={handlePhoneChange}
            placeholder="(416) 555-1234"
            className="
              w-full h-12 px-4
              text-base font-mono
              border-2 border-gray-200 rounded-xl
              focus:border-blue-500 focus:ring-2 focus:ring-blue-100
              transition-colors duration-150
            "
            autoComplete="tel"
          />
        </div>

        {/* Email (Optional) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Email <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="john@example.com"
            className="
              w-full h-12 px-4
              text-base
              border-2 border-gray-200 rounded-xl
              focus:border-blue-500 focus:ring-2 focus:ring-blue-100
              transition-colors duration-150
            "
            autoComplete="email"
          />
        </div>

        {/* Marketing Attribution */}
        <div className="mb-4">
          <MarketingAttributionSelector
            value={marketingSource}
            detail={marketingSourceDetail}
            onChange={({ source, detail }) => {
              setMarketingSource(source);
              setMarketingSourceDetail(detail);
            }}
          />
        </div>

        {/* Communication Preferences */}
        <div className="mb-6">
          <CommunicationPreferences
            value={commPrefs}
            onChange={setCommPrefs}
            hasEmail={!!email.trim()}
            hasPhone={extractPhoneDigits(phone).length >= 10}
          />
        </div>
      </form>

      {/* Footer */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="
            w-full h-14
            flex items-center justify-center gap-2
            bg-green-600 hover:bg-green-700
            disabled:bg-gray-400
            text-white text-lg font-bold
            rounded-xl
            transition-colors duration-150
          "
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <UserPlusIcon className="w-6 h-6" />
              Add Customer
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default QuickAddCustomer;
