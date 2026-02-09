/**
 * TeleTime POS - Pickup Details Form
 * Collects pickup location, date, and time preference for pickup orders
 */

import { useState, useEffect, useCallback } from 'react';
import {
  MapPinIcon,
  CalendarDaysIcon,
  ClockIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingStorefrontIcon,
  ExclamationTriangleIcon,
  UserIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * TeleTime pickup locations
 */
const MOCK_LOCATIONS = [
  {
    id: 1,
    name: 'TeleTime Mississauga (Main Store/Warehouse)',
    address: '3125 Wolfedale Road',
    city: 'Mississauga',
    province: 'ON',
    postalCode: 'L5C 1V8',
    phone: '(905) 273-5550',
    type: 'store',
    pickupHours: 'Mon-Sat 11AM-8PM, Sun 11AM-7PM',
    landmark: 'Mavis and Dundas',
  },
  {
    id: 2,
    name: 'TeleTime Etobicoke',
    address: '1770 Albion Road, Unit 46-47',
    city: 'Etobicoke',
    province: 'ON',
    postalCode: 'M9V 1C3',
    phone: '(416) 743-9633',
    type: 'store',
    pickupHours: 'Mon-Sat 11AM-8PM, Sun 11AM-7PM',
    landmark: 'Albion & HWY 27, East of HWY 27',
  },
  {
    id: 3,
    name: 'TeleTime Springdale',
    address: '51 Mountainash Road, Unit 5',
    city: 'Brampton',
    province: 'ON',
    postalCode: 'L6R 1W4',
    phone: '(905) 799-9901',
    type: 'store',
    pickupHours: 'Mon-Sat 11AM-8PM, Sun 11AM-7PM',
    landmark: 'Springdale Square, on Bovaird west of Airport Road',
  },
  {
    id: 4,
    name: 'TeleTime Brampton',
    address: '280 Rutherford Road S',
    city: 'Brampton',
    province: 'ON',
    postalCode: 'L6W 3K7',
    phone: '(905) 455-1666',
    type: 'store',
    pickupHours: 'Mon-Sat 11AM-8PM, Sun 11AM-7PM',
    landmark: 'North of Steeles, west of HWY 410',
    tollFree: '1-855-312-6755',
  },
];

const VEHICLE_TYPES = [
  { value: 'car', label: 'Car / Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck / Pickup' },
  { value: 'van', label: 'Van' },
  { value: 'other', label: 'Other' },
];

const TIME_PREFERENCES = [
  { value: 'morning', label: 'Late Morning', description: '11:00 AM - 1:00 PM' },
  { value: 'afternoon', label: 'Afternoon', description: '1:00 PM - 5:00 PM' },
  { value: 'evening', label: 'Evening', description: '5:00 PM - 8:00 PM' },
];

export function PickupDetailsForm({ pickupType, customer, onComplete, onBack }) {
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  // Auto-set today's date for pickup_now
  const todayDate = new Date().toISOString().split('T')[0];
  const [pickupDate, setPickupDate] = useState(pickupType === 'pickup_now' ? todayDate : '');
  const [timePreference, setTimePreference] = useState(pickupType === 'pickup_now' ? 'morning' : '');
  const [pickupPersonName, setPickupPersonName] = useState('');
  const [pickupPersonPhone, setPickupPersonPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleNotes, setVehicleNotes] = useState('');
  const [errors, setErrors] = useState({});

  // Default pickup person to customer info
  useEffect(() => {
    if (customer) {
      const name = customer.name || customer.customer_name || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || '';
      const phone = customer.phone || customer.customer_phone || '';
      if (name && !pickupPersonName) setPickupPersonName(name);
      if (phone && !pickupPersonPhone) setPickupPersonPhone(phone);
    }
  }, [customer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get today's date string for min date
  const today = new Date().toISOString().split('T')[0];

  // Fetch pickup locations
  useEffect(() => {
    const abortController = new AbortController();

    const fetchLocations = async () => {
      setLoadingLocations(true);
      try {
        const response = await fetch(`${API_BASE}/locations?type=pickup`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
          signal: abortController.signal,
        });

        const result = await response.json();

        if (abortController.signal.aborted) return;

        if (result.success && result.locations?.length > 0) {
          setLocations(result.locations);
        } else {
          // Use mock data as fallback
          setLocations(MOCK_LOCATIONS);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[PickupDetails] Failed to fetch locations:', err);
        setLocations(MOCK_LOCATIONS);
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingLocations(false);
        }
      }
    };

    fetchLocations();

    return () => abortController.abort();
  }, []);

  // Auto-select first location when locations load
  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  const validate = useCallback(() => {
    const newErrors = {};

    if (!selectedLocationId) {
      newErrors.location = 'Please select a pickup location';
    }
    // For pickup_now, date is auto-set; for scheduled, require selection
    if (!pickupDate && pickupType !== 'pickup_now') {
      newErrors.date = 'Please select a pickup date';
    }
    // Time preference only required for scheduled pickup
    if (!timePreference && pickupType === 'pickup_scheduled') {
      newErrors.time = 'Please select a preferred time';
    }
    if (!pickupPersonName.trim()) {
      newErrors.personName = 'Pickup person name is required';
    }
    if (!pickupPersonPhone.trim()) {
      newErrors.personPhone = 'Pickup person phone is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [selectedLocationId, pickupDate, timePreference, pickupPersonName, pickupPersonPhone, pickupType]);

  const handleContinue = useCallback(() => {
    if (!validate()) return;

    const selectedLocation = locations.find((l) => l.id === selectedLocationId);

    onComplete({
      type: pickupType,
      fee: 0,
      scheduledDate: pickupDate,
      scheduledTimeStart: null,
      scheduledTimeEnd: null,
      address: null,
      zoneId: null,
      notes: null,
      pickupLocationId: selectedLocationId,
      pickupLocationName: selectedLocation?.name || null,
      pickupDate: pickupDate,
      pickupTimePreference: timePreference,
      pickupPersonName: pickupPersonName.trim(),
      pickupPersonPhone: pickupPersonPhone.trim(),
      pickupVehicleType: vehicleType || null,
      pickupVehicleNotes: vehicleNotes.trim() || null,
    });
  }, [validate, locations, selectedLocationId, pickupDate, timePreference, pickupPersonName, pickupPersonPhone, vehicleType, vehicleNotes, pickupType, onComplete]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Pickup Details</h2>
          <p className="text-sm text-gray-500">
            {pickupType === 'pickup_now' ? 'Pickup now' : 'Schedule your pickup'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6">
        {/* ── Pickup Location ── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            <MapPinIcon className="w-4 h-4 inline mr-1 -mt-0.5" />
            Pickup Location
            <span className="text-red-500 ml-0.5">*</span>
          </label>

          {loadingLocations ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-sm text-gray-500">Loading locations...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {locations.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => {
                    setSelectedLocationId(location.id);
                    setErrors((prev) => ({ ...prev, location: undefined }));
                  }}
                  className={`
                    w-full p-4 rounded-xl border-2 text-left transition-all duration-150
                    ${
                      selectedLocationId === location.id
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`
                        flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
                        ${selectedLocationId === location.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}
                      `}
                    >
                      <BuildingStorefrontIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{location.name}</p>
                      <p className="text-sm text-gray-500">
                        {location.address}, {location.city}, {location.province}{' '}
                        {location.postalCode || location.postal_code}
                      </p>
                      {location.landmark && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">({location.landmark})</p>
                      )}
                      {location.phone && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {location.phone}
                          {location.tollFree && <span className="ml-2">Toll Free: {location.tollFree}</span>}
                        </p>
                      )}
                      {(location.pickupHours || location.pickup_hours) && (
                        <p className="text-xs text-blue-600 mt-1">
                          <ClockIcon className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                          {location.pickupHours || location.pickup_hours}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {errors.location && (
            <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
              <ExclamationTriangleIcon className="w-4 h-4" />
              {errors.location}
            </p>
          )}
        </div>

        {/* ── Pickup Date ── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <CalendarDaysIcon className="w-4 h-4 inline mr-1 -mt-0.5" />
            {pickupType === 'pickup_now' ? 'Pickup Date' : 'Preferred Pickup Date'}
            <span className="text-red-500 ml-0.5">*</span>
          </label>

          <input
            type="date"
            value={pickupDate}
            min={today}
            onChange={(e) => {
              setPickupDate(e.target.value);
              setErrors((prev) => ({ ...prev, date: undefined }));
            }}
            className={`
              w-full px-4 py-3 rounded-xl border-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-200
              ${errors.date ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white focus:border-blue-500'}
            `}
          />

          {errors.date && (
            <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
              <ExclamationTriangleIcon className="w-4 h-4" />
              {errors.date}
            </p>
          )}

          {pickupType === 'pickup_now' && (
            <p className="mt-1 text-xs text-gray-400">
              Today's date is pre-selected. Your order will be ready in 5-10 minutes.
            </p>
          )}
        </div>

        {/* ── Pickup Person ── */}
        <div className="bg-violet-50 rounded-xl p-4 border border-violet-200">
          <label className="block text-sm font-semibold text-violet-800 mb-3">
            <UserIcon className="w-4 h-4 inline mr-1 -mt-0.5" />
            Pickup Person
          </label>
          <p className="text-xs text-violet-600 mb-3">
            Defaults to customer. Change if someone else is picking up.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={pickupPersonName}
                onChange={(e) => {
                  setPickupPersonName(e.target.value);
                  setErrors((prev) => ({ ...prev, personName: undefined }));
                }}
                placeholder="Full name"
                className={`
                  w-full px-3 py-2.5 rounded-lg border-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-violet-200
                  ${errors.personName ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white focus:border-violet-500'}
                `}
              />
              {errors.personName && (
                <p className="mt-1 text-xs text-red-600">{errors.personName}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={pickupPersonPhone}
                onChange={(e) => {
                  setPickupPersonPhone(e.target.value);
                  setErrors((prev) => ({ ...prev, personPhone: undefined }));
                }}
                placeholder="(416) 555-0100"
                className={`
                  w-full px-3 py-2.5 rounded-lg border-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-violet-200
                  ${errors.personPhone ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white focus:border-violet-500'}
                `}
              />
              {errors.personPhone && (
                <p className="mt-1 text-xs text-red-600">{errors.personPhone}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Vehicle Details ── */}
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <label className="block text-sm font-semibold text-amber-800 mb-3">
            <TruckIcon className="w-4 h-4 inline mr-1 -mt-0.5" />
            Vehicle Details
            <span className="text-xs font-normal text-amber-600 ml-1">(optional)</span>
          </label>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle Type</label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-500"
            >
              <option value="">-- Select vehicle type --</option>
              {VEHICLE_TYPES.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Vehicle / Loading Notes
            </label>
            <textarea
              value={vehicleNotes}
              onChange={(e) => setVehicleNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Red Toyota Camry, items need to fit in trunk..."
              className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-500 resize-none"
            />
          </div>
        </div>

        {/* ── Time Preference ── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            <ClockIcon className="w-4 h-4 inline mr-1 -mt-0.5" />
            Preferred Pickup Time
            <span className="text-red-500 ml-0.5">*</span>
          </label>

          <div className="grid grid-cols-3 gap-2">
            {TIME_PREFERENCES.map((pref) => (
              <button
                key={pref.value}
                type="button"
                onClick={() => {
                  setTimePreference(pref.value);
                  setErrors((prev) => ({ ...prev, time: undefined }));
                }}
                className={`
                  p-3 rounded-xl border-2 text-center transition-all duration-150
                  ${
                    timePreference === pref.value
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <p className="text-sm font-semibold text-gray-900">{pref.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{pref.description}</p>
              </button>
            ))}
          </div>

          {errors.time && (
            <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
              <ExclamationTriangleIcon className="w-4 h-4" />
              {errors.time}
            </p>
          )}
        </div>
      </div>

      {/* Continue Button */}
      <div className="pt-4 border-t border-gray-200 mt-4">
        <button
          type="button"
          onClick={handleContinue}
          className="
            w-full py-3 px-4
            flex items-center justify-center gap-2
            text-sm font-medium text-white
            bg-blue-600 hover:bg-blue-700
            rounded-xl transition-colors duration-150
          "
        >
          Continue
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default PickupDetailsForm;
