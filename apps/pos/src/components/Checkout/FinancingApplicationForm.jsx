/**
 * TeleTime POS - Financing Application Form Component
 * Collects customer info for financing application
 */

import { useState, useEffect } from 'react';
import {
  UserCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  BuildingLibraryIcon,
  IdentificationIcon,
  PhoneIcon,
  EnvelopeIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Form field component
 */
function FormField({ label, icon: Icon, error, children }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        {Icon && <Icon className="w-4 h-4 text-gray-400" />}
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

/**
 * Credit check result display
 */
function CreditCheckResult({ result, loading }) {
  if (loading) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="font-medium text-gray-900">Checking credit status...</p>
            <p className="text-sm text-gray-500">This only takes a moment</p>
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const isEligible = result.isEligible;

  return (
    <div className={`
      p-4 border rounded-lg
      ${isEligible ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}
    `}>
      <div className="flex items-start gap-3">
        {isEligible ? (
          <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
        ) : (
          <ExclamationTriangleIcon className="w-6 h-6 text-red-600 flex-shrink-0" />
        )}
        <div>
          <p className={`font-medium ${isEligible ? 'text-green-800' : 'text-red-800'}`}>
            {isEligible ? 'Pre-Approved for Store Financing' : 'Additional Review Required'}
          </p>
          <p className={`text-sm mt-1 ${isEligible ? 'text-green-600' : 'text-red-600'}`}>
            {result.message || (isEligible
              ? 'Customer meets requirements for instant approval'
              : 'Application will be reviewed by a manager'
            )}
          </p>
          {isEligible && result.creditLimit && (
            <div className="mt-2 text-sm text-green-700">
              <span>Available credit: </span>
              <span className="font-semibold">{formatCurrency(result.availableCredit || 0)}</span>
              <span className="text-green-600"> of {formatCurrency(result.creditLimit)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Financing application form component
 * @param {object} props
 * @param {object} props.customer - Customer object
 * @param {object} props.selectedPlan - Selected financing plan
 * @param {object} props.paymentPlan - Calculated payment plan
 * @param {object} props.applicationData - Current application data
 * @param {function} props.onUpdate - Update application data
 * @param {function} props.onSubmit - Submit application
 * @param {function} props.onBack - Go back
 * @param {boolean} props.submitting - Submitting state
 */
export function FinancingApplicationForm({
  customer,
  selectedPlan,
  paymentPlan,
  applicationData,
  onUpdate,
  onSubmit,
  onBack,
  submitting = false,
}) {
  const [creditCheck, setCreditCheck] = useState(null);
  const [creditCheckLoading, setCreditCheckLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const isInternalFinancing = selectedPlan?.provider === 'internal';
  const isExternalFinancing = !isInternalFinancing;

  // Prefill form data from customer
  useEffect(() => {
    if (customer && !applicationData.email) {
      onUpdate?.({
        firstName: customer.firstName || customer.name?.split(' ')[0] || '',
        lastName: customer.lastName || customer.name?.split(' ').slice(1).join(' ') || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        zip: customer.zip || customer.postalCode || '',
      });
    }
  }, [customer, applicationData.email, onUpdate]);

  // Check existing credit for store financing
  useEffect(() => {
    if (isInternalFinancing && customer?.id) {
      const checkCredit = async () => {
        try {
          setCreditCheckLoading(true);
          const amountCents = paymentPlan?.principalCents || 0;

          const response = await fetch(`${API_BASE}/pos-payments/account/check-credit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify({
              customerId: customer.id,
              amountCents,
            }),
          });

          const result = await response.json();

          if (response.ok && result.success) {
            setCreditCheck(result.data);
          } else {
            setCreditCheck({
              isEligible: true, // Default to eligible if check fails
              message: 'Credit check unavailable - proceeding with application',
            });
          }
        } catch (err) {
          console.error('[FinancingApplicationForm] Credit check error:', err);
          setCreditCheck({
            isEligible: true,
            message: 'Credit check unavailable - proceeding with application',
          });
        } finally {
          setCreditCheckLoading(false);
        }
      };

      checkCredit();
    }
  }, [isInternalFinancing, customer?.id, paymentPlan?.principalCents]);

  // Handle field change
  const handleChange = (field) => (e) => {
    const value = e.target.value;
    onUpdate?.({ [field]: value });
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  // Validate form
  const validate = () => {
    const newErrors = {};

    if (isExternalFinancing) {
      // External providers need more info
      if (!applicationData.email) newErrors.email = 'Email is required';
      if (!applicationData.phone) newErrors.phone = 'Phone is required';

      // Basic email validation
      if (applicationData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicationData.email)) {
        newErrors.email = 'Invalid email format';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = () => {
    if (validate()) {
      onSubmit?.();
    }
  };

  return (
    <div className="space-y-6">
      {/* Plan Summary */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">{selectedPlan?.planName}</p>
            <p className="text-sm text-blue-600">{selectedPlan?.providerName}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {formatCurrency(paymentPlan?.monthlyPayment || 0)}
              <span className="text-sm font-normal text-gray-500">/mo</span>
            </p>
            <p className="text-sm text-gray-500">
              {paymentPlan?.termMonths} payments
            </p>
          </div>
        </div>
      </div>

      {/* Customer Info Card */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
            <UserCircleIcon className="w-8 h-8 text-gray-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">
              {customer?.name || customer?.customerName || 'Customer'}
            </p>
            <p className="text-sm text-gray-500">
              {customer?.email || 'No email on file'}
            </p>
            {customer?.phone && (
              <p className="text-sm text-gray-500">{customer.phone}</p>
            )}
          </div>
        </div>
      </div>

      {/* Credit Check Result (Store Financing) */}
      {isInternalFinancing && (
        <CreditCheckResult result={creditCheck} loading={creditCheckLoading} />
      )}

      {/* External Provider Notice */}
      {isExternalFinancing && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <BuildingLibraryIcon className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-800">
                External Financing with {selectedPlan?.providerName}
              </p>
              <p className="text-sm text-amber-600 mt-1">
                You'll be redirected to {selectedPlan?.providerName} to complete your application.
                Additional verification may be required.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Application Form Fields */}
      <div className="space-y-4">
        <h3 className="font-medium text-gray-900">
          {isInternalFinancing ? 'Verify Information' : 'Application Information'}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="First Name" icon={IdentificationIcon}>
            <input
              type="text"
              value={applicationData.firstName || ''}
              onChange={handleChange('firstName')}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="First name"
            />
          </FormField>

          <FormField label="Last Name" icon={IdentificationIcon}>
            <input
              type="text"
              value={applicationData.lastName || ''}
              onChange={handleChange('lastName')}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Last name"
            />
          </FormField>
        </div>

        <FormField label="Email" icon={EnvelopeIcon} error={errors.email}>
          <input
            type="email"
            value={applicationData.email || ''}
            onChange={handleChange('email')}
            className={`
              w-full h-10 px-3 border rounded-lg
              focus:border-blue-500 focus:ring-1 focus:ring-blue-500
              ${errors.email ? 'border-red-300' : 'border-gray-200'}
            `}
            placeholder="email@example.com"
            required={isExternalFinancing}
          />
        </FormField>

        <FormField label="Phone" icon={PhoneIcon} error={errors.phone}>
          <input
            type="tel"
            value={applicationData.phone || ''}
            onChange={handleChange('phone')}
            className={`
              w-full h-10 px-3 border rounded-lg
              focus:border-blue-500 focus:ring-1 focus:ring-blue-500
              ${errors.phone ? 'border-red-300' : 'border-gray-200'}
            `}
            placeholder="(555) 123-4567"
            required={isExternalFinancing}
          />
        </FormField>

        {isExternalFinancing && (
          <>
            <FormField label="Address" icon={HomeIcon}>
              <input
                type="text"
                value={applicationData.address || ''}
                onChange={handleChange('address')}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Street address"
              />
            </FormField>

            <div className="grid grid-cols-3 gap-4">
              <FormField label="City">
                <input
                  type="text"
                  value={applicationData.city || ''}
                  onChange={handleChange('city')}
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="City"
                />
              </FormField>

              <FormField label="State">
                <input
                  type="text"
                  value={applicationData.state || ''}
                  onChange={handleChange('state')}
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="ST"
                  maxLength={2}
                />
              </FormField>

              <FormField label="ZIP">
                <input
                  type="text"
                  value={applicationData.zip || ''}
                  onChange={handleChange('zip')}
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="12345"
                  maxLength={10}
                />
              </FormField>
            </div>
          </>
        )}
      </div>

      {/* Disclosure */}
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs text-gray-500">
          By submitting this application, you authorize a credit inquiry and agree to the
          financing terms. {isInternalFinancing ? 'Store financing' : selectedPlan?.providerName}
          {' '}terms and conditions apply. Monthly payments will begin on the scheduled date.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 h-12 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || (creditCheckLoading && isInternalFinancing)}
          className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Processing...</span>
            </>
          ) : isExternalFinancing ? (
            `Continue to ${selectedPlan?.providerName}`
          ) : (
            'Submit Application'
          )}
        </button>
      </div>
    </div>
  );
}

export default FinancingApplicationForm;
