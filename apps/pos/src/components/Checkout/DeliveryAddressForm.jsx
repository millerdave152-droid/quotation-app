/**
 * TeleTime POS - Delivery Address Form Component
 * Address input with customer address selection and postal code validation
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MapPinIcon,
  PlusIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  HomeIcon,
  BuildingOfficeIcon,
  BuildingOffice2Icon,
  ArrowRightOnRectangleIcon,
  ClockIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const parseStreetParts = (street) => {
  if (!street) return { streetNumber: '', streetName: '' };
  const trimmed = street.trim();
  const match = trimmed.match(/^(\d+)\s+(.*)$/);
  if (match) {
    return { streetNumber: match[1], streetName: match[2] };
  }
  return { streetNumber: '', streetName: trimmed };
};

const normalizeAddress = (address) => {
  if (!address) return null;
  if (address.streetNumber && address.streetName) {
    return {
      ...address,
      street: address.street || `${address.streetNumber} ${address.streetName}`,
    };
  }

  const parsed = parseStreetParts(address.street);
  return {
    ...address,
    streetNumber: address.streetNumber || parsed.streetNumber || '',
    streetName: address.streetName || parsed.streetName || '',
    street: address.street || (parsed.streetNumber && parsed.streetName
      ? `${parsed.streetNumber} ${parsed.streetName}`
      : address.street || ''),
  };
};

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
          <p className="text-sm text-gray-600">
            {address.unit && `${address.unit} - `}
            {address.streetNumber ? `${address.streetNumber} ${address.streetName}` : address.street}
          </p>
          <p className="text-sm text-gray-500">
            {address.city}, {address.province} {address.postalCode}
          </p>
          {address.buzzer && (
            <p className="text-xs text-gray-400">Buzzer: {address.buzzer}</p>
          )}
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
export function DeliveryAddressForm({ customer, onComplete, onBack, fulfillmentType = 'local_delivery' }) {
  const isLocalDelivery = fulfillmentType === 'local_delivery';
  const [mode, setMode] = useState('select'); // 'select' or 'new'
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [formData, setFormData] = useState({
    streetNumber: '',
    streetName: '',
    unit: '',
    buzzer: '',
    city: '',
    province: 'ON',
    postalCode: '',
    dwellingType: '',
    floorNumber: '',
    entryPoint: '',
    elevatorRequired: false,
    elevatorDate: '',
    elevatorTime: '',
    conciergePhone: '',
    conciergeNotes: '',
    accessSteps: 0,
    accessNarrowStairs: false,
    accessHeightRestriction: false,
    accessMaxHeight: '',
    accessWidthRestriction: false,
    accessMaxWidth: '',
    accessNotes: '',
    parkingType: '',
    parkingDistance: '',
    parkingNotes: '',
    pathwayConfirmed: false,
    pathwayNotes: '',
    deliveryDate: '',
    deliveryWindowId: null,
    deliveryWindowStart: '',
    deliveryWindowEnd: '',
  });
  const [errors, setErrors] = useState({});
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const resolveDateInputValue = useCallback((input) => {
    if (!input) return '';
    const rawValue = input.value;
    if (rawValue) return rawValue;
    if (input.valueAsDate instanceof Date && !Number.isNaN(input.valueAsDate.getTime())) {
      return input.valueAsDate.toISOString().split('T')[0];
    }
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return '';
  }, []);

  // Mock delivery windows - will be replaced by Hub API call
  const [loadingWindows, setLoadingWindows] = useState(false);
  const [availableWindows, setAvailableWindows] = useState([]);

  const generateMockWindows = useCallback((date) => {
    if (!date) {
      setAvailableWindows([]);
      return;
    }
    setLoadingWindows(true);
    // Simulate API delay
    setTimeout(() => {
      const dayOfWeek = new Date(date + 'T12:00:00').getDay();
      // No delivery on Sundays
      if (dayOfWeek === 0) {
        setAvailableWindows([]);
        setLoadingWindows(false);
        return;
      }
      const windows = [
        { id: 1, start: '09:00', end: '12:00', label: '9:00 AM - 12:00 PM', slotsLeft: 3 },
        { id: 2, start: '12:00', end: '15:00', label: '12:00 PM - 3:00 PM', slotsLeft: 5 },
        { id: 3, start: '15:00', end: '18:00', label: '3:00 PM - 6:00 PM', slotsLeft: 2 },
      ];
      // Saturday has fewer slots
      if (dayOfWeek === 6) {
        windows.pop();
        windows[0].slotsLeft = 1;
        windows[1].slotsLeft = 1;
      }
      setAvailableWindows(windows);
      setLoadingWindows(false);
    }, 400);
  }, []);

  const handleDeliveryDateChange = useCallback((input) => {
    const newDate = resolveDateInputValue(input);
    setFormData((prev) => ({
      ...prev,
      deliveryDate: newDate,
      deliveryWindowId: null,
      deliveryWindowStart: '',
      deliveryWindowEnd: '',
    }));
    setErrors((prev) => ({ ...prev, deliveryDate: null, deliveryWindow: null }));
    generateMockWindows(newDate);
  }, [generateMockWindows, resolveDateInputValue]);

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

  // Dwelling types for delivery
  const dwellingTypes = [
    { value: 'house', label: 'House', Icon: HomeIcon },
    { value: 'townhouse', label: 'Townhouse', Icon: HomeIcon },
    { value: 'condo', label: 'Condo', Icon: BuildingOffice2Icon },
    { value: 'apartment', label: 'Apartment', Icon: BuildingOfficeIcon },
    { value: 'commercial', label: 'Commercial', Icon: BuildingOfficeIcon },
  ];

  // Entry point options for delivery
  const entryPoints = [
    { value: 'front_door', label: 'Front Door' },
    { value: 'back_door', label: 'Back Door' },
    { value: 'side_door', label: 'Side Door' },
    { value: 'garage', label: 'Garage' },
    { value: 'loading_dock', label: 'Loading Dock' },
    { value: 'concierge', label: 'Concierge / Lobby' },
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

    if (!formData.streetNumber.trim()) {
      newErrors.streetNumber = 'Street number is required';
    }

    if (!formData.streetName.trim()) {
      newErrors.streetName = 'Street name is required';
    }

    if (!formData.city.trim()) {
      newErrors.city = 'City is required';
    }

    if (!formData.postalCode.trim()) {
      newErrors.postalCode = 'Postal code is required';
    } else {
      const cleaned = formData.postalCode.replace(/\s/g, '');
      if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/i.test(cleaned)) {
        newErrors.postalCode = 'Invalid postal code format (e.g., A1A 1A1)';
      }
    }

    if (isLocalDelivery) {
      if (!formData.dwellingType) {
        newErrors.dwellingType = 'Dwelling type is required for delivery';
      }

      if (!formData.entryPoint) {
        newErrors.entryPoint = 'Entry point is required for delivery';
      }

      if (formData.elevatorRequired) {
        if (!formData.elevatorDate) {
          newErrors.elevatorDate = 'Booking date is required';
        }
        if (!formData.elevatorTime) {
          newErrors.elevatorTime = 'Booking time window is required';
        }
      }

      if (!formData.pathwayConfirmed) {
        newErrors.pathwayConfirmed = 'Pathway confirmation is required for delivery orders';
      }

      if (!formData.deliveryDate) {
        newErrors.deliveryDate = 'Delivery date is required';
      }
      if (!formData.deliveryWindowStart || !formData.deliveryWindowEnd) {
        newErrors.deliveryWindow = 'Please select a delivery time window';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle continue with selected address
  const handleSelectContinue = useCallback(async () => {
    if (!selectedAddress) return;

    const selectErrors = {};
    if (isLocalDelivery) {
      if (!formData.dwellingType) {
        selectErrors.dwellingType = 'Dwelling type is required for delivery';
      }
      if (!formData.entryPoint) {
        selectErrors.entryPoint = 'Entry point is required for delivery';
      }
      if (formData.elevatorRequired) {
        if (!formData.elevatorDate) {
          selectErrors.elevatorDate = 'Booking date is required';
        }
        if (!formData.elevatorTime) {
          selectErrors.elevatorTime = 'Booking time window is required';
        }
      }
      if (!formData.pathwayConfirmed) {
        selectErrors.pathwayConfirmed = 'Pathway confirmation is required for delivery orders';
      }
      if (!formData.deliveryDate) {
        selectErrors.deliveryDate = 'Delivery date is required';
      }
      if (!formData.deliveryWindowStart || !formData.deliveryWindowEnd) {
        selectErrors.deliveryWindow = 'Please select a delivery time window';
      }
    }
    if (Object.keys(selectErrors).length > 0) {
      setErrors(selectErrors);
      return;
    }

    const normalizedSelected = normalizeAddress(selectedAddress);
    if (!normalizedSelected?.streetNumber || !normalizedSelected?.streetName) {
      setErrors((prev) => ({
        ...prev,
        streetNumber: 'Street number is required. Please enter the full address.',
        streetName: 'Street name is required. Please enter the full address.',
      }));
      setMode('new');
      setSelectedAddress(null);
      setFormData((prev) => ({
        ...prev,
        streetNumber: normalizedSelected?.streetNumber || '',
        streetName: normalizedSelected?.streetName || '',
        unit: normalizedSelected?.unit || '',
        city: normalizedSelected?.city || '',
        province: normalizedSelected?.province || 'ON',
        postalCode: normalizedSelected?.postalCode || '',
      }));
      return;
    }

    const addressWithExtras = {
      ...normalizedSelected,
      dwellingType: isLocalDelivery ? formData.dwellingType : null,
      floorNumber: isLocalDelivery ? (formData.floorNumber.trim() || null) : null,
      entryPoint: isLocalDelivery ? formData.entryPoint : null,
      elevatorRequired: isLocalDelivery ? formData.elevatorRequired : false,
      elevatorDate: isLocalDelivery && formData.elevatorRequired ? formData.elevatorDate : null,
      elevatorTime: isLocalDelivery && formData.elevatorRequired ? formData.elevatorTime : null,
      conciergePhone: formData.conciergePhone.trim() || null,
      conciergeNotes: formData.conciergeNotes.trim() || null,
      accessSteps: isLocalDelivery ? (parseInt(formData.accessSteps, 10) || 0) : 0,
      accessNarrowStairs: isLocalDelivery ? formData.accessNarrowStairs : false,
      accessHeightRestriction: isLocalDelivery && formData.accessHeightRestriction ? (parseInt(formData.accessMaxHeight, 10) || null) : null,
      accessWidthRestriction: isLocalDelivery && formData.accessWidthRestriction ? (parseInt(formData.accessMaxWidth, 10) || null) : null,
      accessNotes: isLocalDelivery ? (formData.accessNotes.trim() || null) : null,
      parkingType: formData.parkingType || null,
      parkingDistance: parseInt(formData.parkingDistance, 10) || null,
      parkingNotes: formData.parkingNotes.trim() || null,
      pathwayConfirmed: isLocalDelivery ? formData.pathwayConfirmed : false,
      pathwayNotes: isLocalDelivery ? (formData.pathwayNotes.trim() || null) : null,
      deliveryDate: isLocalDelivery ? (formData.deliveryDate || null) : null,
      deliveryWindowId: isLocalDelivery ? formData.deliveryWindowId : null,
      deliveryWindowStart: isLocalDelivery ? (formData.deliveryWindowStart || null) : null,
      deliveryWindowEnd: isLocalDelivery ? (formData.deliveryWindowEnd || null) : null,
    };
    const result = await validateAddress(addressWithExtras);
    onComplete(addressWithExtras, result);
  }, [selectedAddress, formData, validateAddress, onComplete]);

  // Handle continue with new address
  const handleFormContinue = useCallback(async () => {
    if (!validateForm()) return;

    const address = {
      streetNumber: formData.streetNumber.trim(),
      streetName: formData.streetName.trim(),
      street: `${formData.streetNumber.trim()} ${formData.streetName.trim()}`,
      unit: formData.unit.trim() || null,
      buzzer: formData.buzzer.trim() || null,
      city: formData.city.trim(),
      province: formData.province,
      postalCode: formData.postalCode.trim(),
      dwellingType: isLocalDelivery ? formData.dwellingType : null,
      floorNumber: isLocalDelivery ? (formData.floorNumber.trim() || null) : null,
      entryPoint: isLocalDelivery ? formData.entryPoint : null,
      elevatorRequired: isLocalDelivery ? formData.elevatorRequired : false,
      elevatorDate: isLocalDelivery && formData.elevatorRequired ? formData.elevatorDate : null,
      elevatorTime: isLocalDelivery && formData.elevatorRequired ? formData.elevatorTime : null,
      conciergePhone: formData.conciergePhone.trim() || null,
      conciergeNotes: formData.conciergeNotes.trim() || null,
      accessSteps: isLocalDelivery ? (parseInt(formData.accessSteps, 10) || 0) : 0,
      accessNarrowStairs: isLocalDelivery ? formData.accessNarrowStairs : false,
      accessHeightRestriction: isLocalDelivery && formData.accessHeightRestriction ? (parseInt(formData.accessMaxHeight, 10) || null) : null,
      accessWidthRestriction: isLocalDelivery && formData.accessWidthRestriction ? (parseInt(formData.accessMaxWidth, 10) || null) : null,
      accessNotes: isLocalDelivery ? (formData.accessNotes.trim() || null) : null,
      parkingType: formData.parkingType || null,
      parkingDistance: parseInt(formData.parkingDistance, 10) || null,
      parkingNotes: formData.parkingNotes.trim() || null,
      pathwayConfirmed: isLocalDelivery ? formData.pathwayConfirmed : false,
      pathwayNotes: isLocalDelivery ? (formData.pathwayNotes.trim() || null) : null,
      deliveryDate: isLocalDelivery ? (formData.deliveryDate || null) : null,
      deliveryWindowId: isLocalDelivery ? formData.deliveryWindowId : null,
      deliveryWindowStart: isLocalDelivery ? (formData.deliveryWindowStart || null) : null,
      deliveryWindowEnd: isLocalDelivery ? (formData.deliveryWindowEnd || null) : null,
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
              <div className="grid grid-cols-3 gap-4">
                <AddressInput
                  label="Street Number"
                  name="streetNumber"
                  value={formData.streetNumber}
                  onChange={handleInputChange}
                  placeholder="123"
                  error={errors.streetNumber}
                  required
                />

                <div className="col-span-2">
                  <AddressInput
                    label="Street Name"
                    name="streetName"
                    value={formData.streetName}
                    onChange={handleInputChange}
                    placeholder="Main Street"
                    error={errors.streetName}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <AddressInput
                  label="Unit / Suite"
                  name="unit"
                  value={formData.unit}
                  onChange={handleInputChange}
                  placeholder="Apt 4B"
                />

                <AddressInput
                  label="Buzzer Code"
                  name="buzzer"
                  value={formData.buzzer}
                  onChange={handleInputChange}
                  placeholder="0412"
                />
              </div>

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
                    Province <span className="text-red-500 ml-1">*</span>
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

        {/* Delivery Window Selector - shown in both modes */}
        <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
          <h3 className="text-sm font-medium text-gray-800 mb-1 flex items-center gap-2">
            <CalendarDaysIcon className="w-4 h-4 text-emerald-600" />
            Delivery Window
            <span className="text-red-500">*</span>
          </h3>
          <p className="text-xs text-gray-500 mb-3">Select a date and time window for delivery</p>

          <div className="space-y-3">
            {/* Date picker */}
            <div>
              <label htmlFor="deliveryDate" className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Date <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="date"
                id="deliveryDate"
                name="deliveryDate"
                value={formData.deliveryDate}
                onChange={(e) => handleDeliveryDateChange(e.target)}
                onInput={(e) => handleDeliveryDateChange(e.target)}
                min={(() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  return tomorrow.toISOString().split('T')[0];
                })()}
                className={`
                  w-full px-3 py-2.5 rounded-lg border text-sm
                  focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500
                  ${errors.deliveryDate ? 'border-red-300 bg-red-50' : 'border-gray-300'}
                `}
              />
              {errors.deliveryDate && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <ExclamationCircleIcon className="w-3 h-3" />
                  {errors.deliveryDate}
                </p>
              )}
            </div>

            {/* Time window slots */}
            {formData.deliveryDate && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Window <span className="text-red-500 ml-1">*</span>
                </label>

                {loadingWindows ? (
                  <div className="flex items-center gap-2 py-4 justify-center text-sm text-gray-500">
                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    Checking availability...
                  </div>
                ) : availableWindows.length === 0 ? (
                  <div className="py-4 px-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
                    <p className="text-sm font-medium text-amber-800">No delivery slots available</p>
                    <p className="text-xs text-amber-600 mt-1">Please select a different date. We do not deliver on Sundays.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {availableWindows.map((window) => (
                      <button
                        key={window.id}
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            deliveryWindowId: window.id,
                            deliveryWindowStart: window.start,
                            deliveryWindowEnd: window.end,
                          }));
                          setErrors((prev) => ({ ...prev, deliveryWindow: null }));
                        }}
                        className={`
                          flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-150
                          ${
                            formData.deliveryWindowId === window.id
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2">
                          <ClockIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm font-medium">{window.label}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          window.slotsLeft <= 2
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {window.slotsLeft} {window.slotsLeft === 1 ? 'slot' : 'slots'} left
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {errors.deliveryWindow && (
                  <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                    <ExclamationCircleIcon className="w-3 h-3" />
                    {errors.deliveryWindow}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dwelling Type Selector - shown in both modes */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Dwelling Type <span className="text-red-500 ml-1">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {dwellingTypes.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFormData((prev) => ({ ...prev, dwellingType: value }));
                  setErrors((prev) => ({ ...prev, dwellingType: null }));
                }}
                className={`
                  flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-center transition-all duration-150
                  ${
                    formData.dwellingType === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
          {errors.dwellingType && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <ExclamationCircleIcon className="w-3 h-3" />
              {errors.dwellingType}
            </p>
          )}
        </div>

        {/* Floor Number - shown in both modes, emphasized for condo/apartment */}
        {(() => {
          const isMultiUnit = ['condo', 'apartment', 'commercial'].includes(formData.dwellingType);
          return (
            <div className={`mt-4 p-4 rounded-lg transition-colors duration-200 ${isMultiUnit ? 'bg-amber-50 border border-amber-200' : ''}`}>
              <label htmlFor="floorNumber" className="block text-sm font-medium text-gray-700 mb-1">
                Floor Number
                {isMultiUnit && <span className="text-amber-600 ml-2 text-xs font-normal">(Recommended)</span>}
              </label>
              <div className="flex gap-2">
                {['Ground', 'Basement'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, floorNumber: preset }));
                      setErrors((prev) => ({ ...prev, floorNumber: null }));
                    }}
                    className={`
                      px-3 py-2.5 rounded-lg border-2 text-xs font-medium transition-all duration-150
                      ${
                        formData.floorNumber === preset
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }
                    `}
                  >
                    {preset}
                  </button>
                ))}
                <input
                  type="text"
                  id="floorNumber"
                  name="floorNumber"
                  value={['Ground', 'Basement'].includes(formData.floorNumber) ? '' : formData.floorNumber}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, floorNumber: e.target.value }));
                    setErrors((prev) => ({ ...prev, floorNumber: null }));
                  }}
                  placeholder={isMultiUnit ? 'e.g. 14' : 'Floor #'}
                  className={`
                    flex-1 px-4 py-2.5 rounded-lg border text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${errors.floorNumber ? 'border-red-300 bg-red-50' : 'border-gray-300'}
                  `}
                />
              </div>
              {errors.floorNumber && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <ExclamationCircleIcon className="w-3 h-3" />
                  {errors.floorNumber}
                </p>
              )}
              {isMultiUnit && !formData.floorNumber && (
                <p className="mt-1.5 text-xs text-amber-600">
                  Floor number helps delivery drivers locate the unit faster.
                </p>
              )}
            </div>
          );
        })()}

        {/* Entry Point Selector - shown in both modes */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Entry Point <span className="text-red-500 ml-1">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
            {entryPoints.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFormData((prev) => ({ ...prev, entryPoint: value }));
                  setErrors((prev) => ({ ...prev, entryPoint: null }));
                }}
                className={`
                  flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-all duration-150
                  ${
                    formData.entryPoint === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
          {errors.entryPoint && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <ExclamationCircleIcon className="w-3 h-3" />
              {errors.entryPoint}
            </p>
          )}
        </div>

        {/* Access Constraints - shown in both modes */}
        <div className="mt-4 p-4 rounded-lg bg-orange-50 border border-orange-200">
          <h3 className="text-sm font-medium text-gray-800 mb-3">Access Constraints</h3>
          <p className="text-xs text-gray-500 mb-3">Important for furniture and appliance deliveries</p>

          <div className="space-y-3">
            {/* Steps to entrance */}
            <div>
              <label htmlFor="accessSteps" className="block text-sm font-medium text-gray-700 mb-1">
                Number of steps to entrance
              </label>
              <input
                type="number"
                id="accessSteps"
                name="accessSteps"
                value={formData.accessSteps}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                  setFormData((prev) => ({ ...prev, accessSteps: val }));
                }}
                min="0"
                className="w-32 px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            {/* Narrow stairs toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Narrow stairs or tight turns?</label>
              <div className="flex gap-2">
                {[{ value: true, label: 'Yes' }, { value: false, label: 'No' }].map(({ value, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, accessNarrowStairs: value }))}
                    className={`
                      px-4 py-1.5 rounded-lg border-2 text-xs font-medium transition-all duration-150
                      ${
                        formData.accessNarrowStairs === value
                          ? 'border-orange-500 bg-orange-100 text-orange-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }
                    `}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Height restriction */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">Any height restrictions?</label>
                <div className="flex gap-2">
                  {[{ value: true, label: 'Yes' }, { value: false, label: 'No' }].map(({ value, label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, accessHeightRestriction: value, ...(!value && { accessMaxHeight: '' }) }))}
                      className={`
                        px-4 py-1.5 rounded-lg border-2 text-xs font-medium transition-all duration-150
                        ${
                          formData.accessHeightRestriction === value
                            ? 'border-orange-500 bg-orange-100 text-orange-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }
                      `}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {formData.accessHeightRestriction && (
                <div className="flex items-center gap-2 mt-2">
                  <label htmlFor="accessMaxHeight" className="text-xs text-gray-600">Max height:</label>
                  <input
                    type="number"
                    id="accessMaxHeight"
                    name="accessMaxHeight"
                    value={formData.accessMaxHeight}
                    onChange={handleInputChange}
                    min="1"
                    placeholder="e.g. 78"
                    className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <span className="text-xs text-gray-500">inches</span>
                </div>
              )}
            </div>

            {/* Width restriction */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">Any width restrictions?</label>
                <div className="flex gap-2">
                  {[{ value: true, label: 'Yes' }, { value: false, label: 'No' }].map(({ value, label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, accessWidthRestriction: value, ...(!value && { accessMaxWidth: '' }) }))}
                      className={`
                        px-4 py-1.5 rounded-lg border-2 text-xs font-medium transition-all duration-150
                        ${
                          formData.accessWidthRestriction === value
                            ? 'border-orange-500 bg-orange-100 text-orange-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }
                      `}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {formData.accessWidthRestriction && (
                <div className="flex items-center gap-2 mt-2">
                  <label htmlFor="accessMaxWidth" className="text-xs text-gray-600">Max width:</label>
                  <input
                    type="number"
                    id="accessMaxWidth"
                    name="accessMaxWidth"
                    value={formData.accessMaxWidth}
                    onChange={handleInputChange}
                    min="1"
                    placeholder="e.g. 32"
                    className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <span className="text-xs text-gray-500">inches</span>
                </div>
              )}
            </div>

            {/* Access notes */}
            <div>
              <label htmlFor="accessNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Additional Access Notes
              </label>
              <textarea
                id="accessNotes"
                name="accessNotes"
                value={formData.accessNotes}
                onChange={handleInputChange}
                rows={2}
                placeholder="e.g. Narrow hallway on 2nd floor, remove doors from hinges"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Parking Situation - shown in both modes */}
        <div className="mt-4 p-4 rounded-lg bg-sky-50 border border-sky-200">
          <h3 className="text-sm font-medium text-gray-800 mb-3">Parking Situation</h3>

          <div className="space-y-3">
            {/* Parking type dropdown */}
            <div>
              <label htmlFor="parkingType" className="block text-sm font-medium text-gray-700 mb-1">
                Parking Type
              </label>
              <select
                id="parkingType"
                name="parkingType"
                value={formData.parkingType}
                onChange={handleInputChange}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="">Select parking type...</option>
                <option value="driveway">Driveway (can park in driveway)</option>
                <option value="street">Street parking (nearby street)</option>
                <option value="underground">Underground parking</option>
                <option value="parking_lot">Parking lot</option>
                <option value="no_parking">No parking available</option>
              </select>
            </div>

            {/* Distance from parking to door */}
            <div className="flex items-center gap-2">
              <label htmlFor="parkingDistance" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Distance to door
              </label>
              <input
                type="number"
                id="parkingDistance"
                name="parkingDistance"
                value={formData.parkingDistance}
                onChange={handleInputChange}
                min="0"
                placeholder="e.g. 50"
                className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
              <span className="text-xs text-gray-500">feet</span>
            </div>

            {/* Parking notes */}
            <div>
              <label htmlFor="parkingNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Parking Notes
              </label>
              <textarea
                id="parkingNotes"
                name="parkingNotes"
                value={formData.parkingNotes}
                onChange={handleInputChange}
                rows={2}
                placeholder="e.g. Park in visitor spot #3, use parking code 1234"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Elevator Booking - conditionally visible for condo/apartment */}
        {['condo', 'apartment'].includes(formData.dwellingType) && (
          <div className="mt-4 p-4 rounded-lg bg-purple-50 border border-purple-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Elevator Booking Required?
            </label>
            <div className="flex gap-2 mb-3">
              {[{ value: true, label: 'Yes' }, { value: false, label: 'No' }].map(({ value, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, elevatorRequired: value }));
                    setErrors((prev) => ({ ...prev, elevatorDate: null, elevatorTime: null }));
                  }}
                  className={`
                    flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all duration-150
                    ${
                      formData.elevatorRequired === value
                        ? 'border-purple-500 bg-purple-100 text-purple-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }
                  `}
                >
                  {label}
                </button>
              ))}
            </div>

            {formData.elevatorRequired && (
              <div className="space-y-3 pt-2 border-t border-purple-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="elevatorDate" className="block text-sm font-medium text-gray-700 mb-1">
                      Booking Date <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                      type="date"
                      id="elevatorDate"
                      name="elevatorDate"
                      value={formData.elevatorDate}
                      onChange={handleInputChange}
                      min={new Date().toISOString().split('T')[0]}
                      className={`
                        w-full px-3 py-2.5 rounded-lg border text-sm
                        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500
                        ${errors.elevatorDate ? 'border-red-300 bg-red-50' : 'border-gray-300'}
                      `}
                    />
                    {errors.elevatorDate && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <ExclamationCircleIcon className="w-3 h-3" />
                        {errors.elevatorDate}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="elevatorTime" className="block text-sm font-medium text-gray-700 mb-1">
                      Time Window <span className="text-red-500 ml-1">*</span>
                    </label>
                    <select
                      id="elevatorTime"
                      name="elevatorTime"
                      value={formData.elevatorTime}
                      onChange={handleInputChange}
                      className={`
                        w-full px-3 py-2.5 rounded-lg border text-sm
                        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500
                        ${errors.elevatorTime ? 'border-red-300 bg-red-50' : 'border-gray-300'}
                      `}
                    >
                      <option value="">Select time...</option>
                      <option value="8:00 AM - 10:00 AM">8:00 AM - 10:00 AM</option>
                      <option value="10:00 AM - 12:00 PM">10:00 AM - 12:00 PM</option>
                      <option value="12:00 PM - 2:00 PM">12:00 PM - 2:00 PM</option>
                      <option value="2:00 PM - 4:00 PM">2:00 PM - 4:00 PM</option>
                      <option value="4:00 PM - 6:00 PM">4:00 PM - 6:00 PM</option>
                    </select>
                    {errors.elevatorTime && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <ExclamationCircleIcon className="w-3 h-3" />
                        {errors.elevatorTime}
                      </p>
                    )}
                  </div>
                </div>

                <AddressInput
                  label="Concierge Phone"
                  name="conciergePhone"
                  value={formData.conciergePhone}
                  onChange={handleInputChange}
                  placeholder="(416) 555-0123"
                />

                <div>
                  <label htmlFor="conciergeNotes" className="block text-sm font-medium text-gray-700 mb-1">
                    Concierge / Building Notes
                  </label>
                  <textarea
                    id="conciergeNotes"
                    name="conciergeNotes"
                    value={formData.conciergeNotes}
                    onChange={handleInputChange}
                    rows={2}
                    placeholder="e.g. Call concierge 30 min before arrival"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pathway Confirmation - liability step, final section */}
        <div className={`mt-4 p-4 rounded-lg border ${errors.pathwayConfirmed ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
          <h3 className="text-sm font-medium text-gray-800 mb-2">Pathway Confirmation</h3>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="pathwayConfirmed"
              checked={formData.pathwayConfirmed}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, pathwayConfirmed: e.target.checked }));
                setErrors((prev) => ({ ...prev, pathwayConfirmed: null }));
              }}
              className="mt-0.5 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="pathwayConfirmed" className="text-sm text-gray-700">
              Customer confirms pathway will be 100% clear on delivery day
              <span className="text-red-500 ml-1">*</span>
            </label>
          </div>
          {errors.pathwayConfirmed && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <ExclamationCircleIcon className="w-3 h-3" />
              {errors.pathwayConfirmed}
            </p>
          )}

          <div className="mt-3">
            <label htmlFor="pathwayNotes" className="block text-sm font-medium text-gray-700 mb-1">
              Any obstacles to be aware of?
            </label>
            <textarea
              id="pathwayNotes"
              name="pathwayNotes"
              value={formData.pathwayNotes}
              onChange={handleInputChange}
              rows={2}
              placeholder="e.g. Snow in winter, dogs in yard, ongoing construction near entrance"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

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
