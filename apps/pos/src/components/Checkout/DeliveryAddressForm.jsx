/**
 * TeleTime POS - Delivery Address Form Component
 * Address input with customer address selection and postal code validation
 */

import { useState, useEffect, useCallback } from 'react';
import {
  MapPinIcon,
  PlusIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Saved address card component
 */
function SavedAddressCard({ address, isSelected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(address)}
      className={`
        w-full p-4 rounded-xl border-2 text-left transition-all duration-150
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <MapPinIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
        <div className="flex-1 min-w-0">
          {address.label && (
            <p className="text-sm font-medium text-gray-900 mb-1">{address.label}</p>
          )}
          <p className="text-sm text-gray-600">{address.street}</p>
          <p className="text-sm text-gray-500">
            {address.city}, {address.province} {address.postalCode}
          </p>
        </div>
        {isSelected && (
          <CheckCircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
        )}
      </div>
    </button>
  );
}

/**
 * Address form input component
 */
function AddressInput({ label, name, value, onChange, placeholder, error, required = false }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type="text"
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`
          w-full px-4 py-3 rounded-lg border text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          ${error ? 'border-red-300 bg-red-50' : 'border-gray-300'}
        `}
      />
      {error && (
        <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
          <ExclamationCircleIcon className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Delivery address form component
 */
export function DeliveryAddressForm({ customer, onComplete, onBack }) {
  const [mode, setMode] = useState('select'); // 'select' or 'new'
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [formData, setFormData] = useState({
    street: '',
    unit: '',
    city: '',
    province: 'ON',
    postalCode: '',
  });
  const [errors, setErrors] = useState({});
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Canadian provinces
  const provinces = [
    { code: 'ON', name: 'Ontario' },
    { code: 'QC', name: 'Quebec' },
    { code: 'BC', name: 'British Columbia' },
    { code: 'AB', name: 'Alberta' },
    { code: 'MB', name: 'Manitoba' },
    { code: 'SK', name: 'Saskatchewan' },
    { code: 'NS', name: 'Nova Scotia' },
    { code: 'NB', name: 'New Brunswick' },
    { code: 'NL', name: 'Newfoundland and Labrador' },
    { code: 'PE', name: 'Prince Edward Island' },
    { code: 'NT', name: 'Northwest Territories' },
    { code: 'YT', name: 'Yukon' },
    { code: 'NU', name: 'Nunavut' },
  ];

  // Load customer's saved addresses
  useEffect(() => {
    if (customer) {
      const addresses = [];

      // Primary address
      if (customer.address || customer.street) {
        addresses.push({
          id: 'primary',
          label: 'Primary Address',
          street: customer.address || customer.street,
          unit: customer.unit || '',
          city: customer.city || '',
          province: customer.province || 'ON',
          postalCode: customer.postalCode || customer.postal_code || '',
        });
      }

      // Shipping address if different
      if (customer.shippingAddress || customer.shipping_address) {
        const shipping = customer.shippingAddress || customer.shipping_address;
        if (typeof shipping === 'object') {
          addresses.push({
            id: 'shipping',
            label: 'Shipping Address',
            ...shipping,
          });
        }
      }

      // Additional addresses from customer record
      if (customer.addresses && Array.isArray(customer.addresses)) {
        customer.addresses.forEach((addr, index) => {
          addresses.push({
            id: `addr_${index}`,
            label: addr.label || `Address ${index + 1}`,
            ...addr,
          });
        });
      }

      setSavedAddresses(addresses);

      // If only one address, auto-select it
      if (addresses.length === 1) {
        setSelectedAddress(addresses[0]);
      }

      // If no addresses, go directly to new address form
      if (addresses.length === 0) {
        setMode('new');
      }
    } else {
      setMode('new');
    }
  }, [customer]);

  // Handle form input change
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: null }));
    setValidationResult(null);
  }, []);

  // Format postal code (Canadian format: A1A 1A1)
  const formatPostalCode = useCallback((value) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length <= 3) return cleaned;
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)}`;
  }, []);

  // Handle postal code change with formatting
  const handlePostalCodeChange = useCallback(
    (e) => {
      const formatted = formatPostalCode(e.target.value);
      setFormData((prev) => ({ ...prev, postalCode: formatted }));
      setErrors((prev) => ({ ...prev, postalCode: null }));
      setValidationResult(null);
    },
    [formatPostalCode]
  );

  // Validate postal code against delivery zones
  const validateAddress = useCallback(async (address) => {
    setValidating(true);
    setValidationResult(null);

    try {
      const response = await fetch(`${API_BASE}/delivery/validate-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({ address }),
      });

      const result = await response.json();

      setValidationResult(result);
      return result;
    } catch (err) {
      console.error('[DeliveryAddress] Validation error:', err);
      // Allow proceeding even if validation fails
      return { valid: true, message: 'Could not validate address' };
    } finally {
      setValidating(false);
    }
  }, []);

  // Validate form
  const validateForm = useCallback(() => {
    const newErrors = {};

    if (!formData.street.trim()) {
      newErrors.street = 'Street address is required';
    }

    if (!formData.city.trim()) {
      newErrors.city = 'City is required';
    }

    if (!formData.postalCode.trim()) {
      newErrors.postalCode = 'Postal code is required';
    } else if (!/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(formData.postalCode.replace(/\s/g, ''))) {
      newErrors.postalCode = 'Invalid postal code format (e.g., A1A 1A1)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle continue with selected address
  const handleSelectContinue = useCallback(async () => {
    if (!selectedAddress) return;

    const result = await validateAddress(selectedAddress);
    onComplete(selectedAddress, result);
  }, [selectedAddress, validateAddress, onComplete]);

  // Handle continue with new address
  const handleFormContinue = useCallback(async () => {
    if (!validateForm()) return;

    const address = {
      street: formData.street.trim(),
      unit: formData.unit.trim(),
      city: formData.city.trim(),
      province: formData.province,
      postalCode: formData.postalCode.trim(),
    };

    const result = await validateAddress(address);
    onComplete(address, result);
  }, [formData, validateForm, validateAddress, onComplete]);

  // Handle mode switch to new address
  const handleNewAddress = useCallback(() => {
    setMode('new');
    setSelectedAddress(null);
    setValidationResult(null);
  }, []);

  // Handle mode switch to select
  const handleSelectSaved = useCallback(() => {
    if (savedAddresses.length > 0) {
      setMode('select');
      setValidationResult(null);
    }
  }, [savedAddresses]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
        <h2 className="text-xl font-bold text-gray-900">Delivery Address</h2>
        <p className="text-sm text-gray-500">Where should we deliver your order?</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'select' ? (
          <>
            {/* Saved addresses */}
            <div className="space-y-3 mb-4">
              {savedAddresses.map((address) => (
                <SavedAddressCard
                  key={address.id}
                  address={address}
                  isSelected={selectedAddress?.id === address.id}
                  onSelect={setSelectedAddress}
                />
              ))}
            </div>

            {/* New address button */}
            <button
              type="button"
              onClick={handleNewAddress}
              className="
                w-full p-4 rounded-xl border-2 border-dashed border-gray-300
                text-gray-500 hover:border-gray-400 hover:text-gray-600
                flex items-center justify-center gap-2
                transition-colors duration-150
              "
            >
              <PlusIcon className="w-5 h-5" />
              Use a different address
            </button>
          </>
        ) : (
          <>
            {/* Back to saved addresses */}
            {savedAddresses.length > 0 && (
              <button
                type="button"
                onClick={handleSelectSaved}
                className="mb-4 text-sm text-blue-600 hover:text-blue-700"
              >
                Use a saved address instead
              </button>
            )}

            {/* Address form */}
            <div className="space-y-4">
              <AddressInput
                label="Street Address"
                name="street"
                value={formData.street}
                onChange={handleInputChange}
                placeholder="123 Main Street"
                error={errors.street}
                required
              />

              <AddressInput
                label="Unit/Apt (optional)"
                name="unit"
                value={formData.unit}
                onChange={handleInputChange}
                placeholder="Apt 4B"
              />

              <div className="grid grid-cols-2 gap-4">
                <AddressInput
                  label="City"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="Toronto"
                  error={errors.city}
                  required
                />

                <div>
                  <label
                    htmlFor="province"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Province
                  </label>
                  <select
                    id="province"
                    name="province"
                    value={formData.province}
                    onChange={handleInputChange}
                    className="
                      w-full px-4 py-3 rounded-lg border border-gray-300 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    "
                  >
                    {provinces.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <AddressInput
                label="Postal Code"
                name="postalCode"
                value={formData.postalCode}
                onChange={handlePostalCodeChange}
                placeholder="A1A 1A1"
                error={errors.postalCode}
                required
              />
            </div>
          </>
        )}

        {/* Validation result */}
        {validationResult && (
          <div
            className={`
            mt-4 p-4 rounded-lg flex items-start gap-3
            ${
              validationResult.valid || validationResult.deliverable
                ? 'bg-green-50 border border-green-200'
                : 'bg-amber-50 border border-amber-200'
            }
          `}
          >
            {validationResult.valid || validationResult.deliverable ? (
              <>
                <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {validationResult.zoneName
                      ? `Delivery available to ${validationResult.zoneName}`
                      : 'Address is within our delivery area'}
                  </p>
                  {validationResult.fee !== undefined && (
                    <p className="text-sm text-green-600 mt-1">
                      Delivery fee: {validationResult.fee === 0 ? 'FREE' : `$${validationResult.fee.toFixed(2)}`}
                    </p>
                  )}
                  {validationResult.estimatedDays && (
                    <p className="text-sm text-green-600">
                      Estimated delivery: {validationResult.estimatedDays} day(s)
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <ExclamationCircleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {validationResult.message || 'This address is outside our standard delivery area'}
                  </p>
                  <p className="text-sm text-amber-600 mt-1">
                    Additional shipping charges may apply. You can still proceed.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-4 border-t border-gray-200 mt-4">
        <button
          type="button"
          onClick={mode === 'select' ? handleSelectContinue : handleFormContinue}
          disabled={
            validating ||
            (mode === 'select' && !selectedAddress)
          }
          className="
            w-full py-3 px-4
            flex items-center justify-center gap-2
            text-sm font-medium text-white
            bg-blue-600 hover:bg-blue-700
            disabled:bg-gray-300 disabled:cursor-not-allowed
            rounded-xl
            transition-colors duration-150
          "
        >
          {validating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Validating...
            </>
          ) : (
            <>
              Continue
              <ArrowRightIcon className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default DeliveryAddressForm;
