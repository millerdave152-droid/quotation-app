/**
 * TeleTime POS - Fulfillment Selector Component
 * Allows selection of fulfillment type: pickup now, scheduled pickup, delivery
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBagIcon,
  CalendarDaysIcon,
  TruckIcon,
  CheckIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import DeliveryAddressForm from './DeliveryAddressForm';
import SchedulePicker from './SchedulePicker';
import PickupDetailsForm from './PickupDetailsForm';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Fulfillment option card component
 */
function FulfillmentOptionCard({
  option,
  isSelected,
  onSelect,
  disabled = false,
}) {
  const icons = {
    pickup_now: ShoppingBagIcon,
    pickup_scheduled: CalendarDaysIcon,
    local_delivery: TruckIcon,
    shipping: TruckIcon,
  };

  const Icon = icons[option.type] || ShoppingBagIcon;

  const getEstimateText = () => {
    if (option.type === 'pickup_now') {
      return 'Ready in 5-10 min';
    }
    if (option.estimatedDays) {
      if (option.estimatedDays === 1) {
        return 'Next day';
      }
      return `${option.estimatedDays} days`;
    }
    return 'Select date/time';
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(option)}
      disabled={disabled || !option.available}
      className={`
        relative w-full p-4 rounded-xl border-2 text-left transition-all duration-150
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
        }
        ${!option.available || disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
          <CheckIcon className="w-4 h-4 text-white" />
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`
          flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center
          ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}
        `}
        >
          <Icon className="w-6 h-6" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-gray-900">{option.name}</h3>
            {/* Price badge */}
            <span
              className={`
              px-2 py-0.5 rounded-full text-sm font-medium
              ${
                option.fee === 0
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }
            `}
            >
              {option.fee === 0 ? 'FREE' : formatCurrency(option.fee)}
            </span>
          </div>

          <p className="text-sm text-gray-500">{option.description || getEstimateText()}</p>

          {/* Free delivery threshold info */}
          {option.freeThreshold && option.fee > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              Free on orders over {formatCurrency(option.freeThreshold)}
            </p>
          )}

          {/* Unavailable reason */}
          {!option.available && option.unavailableReason && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <ExclamationTriangleIcon className="w-3 h-3" />
              {option.unavailableReason}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Fulfillment selector main component
 */
export function FulfillmentSelector({
  cart,
  customer,
  onComplete,
  selectedFulfillment,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [step, setStep] = useState('select'); // 'select', 'address', 'schedule', 'pickup'
  const [deliveryAddress, setDeliveryAddress] = useState(null);
  const [scheduleData, setScheduleData] = useState(null);

  // Fetch available options with abort controller to prevent memory leaks
  useEffect(() => {
    const abortController = new AbortController();

    const fetchOptions = async () => {
      setLoading(true);
      setError(null);

      try {
        const cartData = {
          items: cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          subtotal: cart.subtotal,
          customerId: customer?.customerId || customer?.customer_id,
        };

        const response = await fetch(`${API_BASE}/delivery/options`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
          body: JSON.stringify({
            cart: cartData,
            address: customer?.address || null,
          }),
          signal: abortController.signal,
        });

        const result = await response.json();

        // Check if aborted before updating state
        if (abortController.signal.aborted) return;

        // Default fulfillment options as fallback
        const defaultOptions = [
          {
            type: 'pickup_now',
            name: 'Pickup Now',
            description: 'Ready in 5-10 minutes',
            fee: 0,
            available: true,
          },
          {
            type: 'pickup_scheduled',
            name: 'Scheduled Pickup',
            description: 'Choose a convenient time',
            fee: 0,
            available: true,
          },
          {
            type: 'local_delivery',
            name: 'Local Delivery',
            description: 'Delivery to your address',
            fee: 49.99,
            freeThreshold: 999,
            available: true,
          },
        ];

        if (result.success) {
          const normalizedOptions = (result.options || []).map((opt) => ({
            ...opt,
            available: opt.available !== undefined ? opt.available : true,
          }));

          if (normalizedOptions.length === 0) {
            // API returned empty options - use defaults
            setOptions(defaultOptions);
          } else {
            setOptions(normalizedOptions);
          }

          // Pre-select if fulfillment already set
          const optionsToUse = normalizedOptions.length > 0 ? normalizedOptions : defaultOptions;
          if (selectedFulfillment) {
            const existing = optionsToUse.find((o) => o.type === selectedFulfillment.type);
            if (existing) {
              setSelectedOption(existing);
            }
          }
        } else {
          // If API fails, provide default options
          setOptions(defaultOptions);
        }
      } catch (err) {
        // Don't update state if the request was aborted
        if (err.name === 'AbortError') return;

        console.error('[Fulfillment] Fetch options error:', err);
        setError('Failed to load fulfillment options');
        // Provide fallback options - all 3 fulfillment types
        setOptions([
          {
            type: 'pickup_now',
            name: 'Pickup Now',
            description: 'Ready in 5-10 minutes',
            fee: 0,
            available: true,
          },
          {
            type: 'pickup_scheduled',
            name: 'Scheduled Pickup',
            description: 'Choose a convenient time',
            fee: 0,
            available: true,
          },
          {
            type: 'local_delivery',
            name: 'Local Delivery',
            description: 'Delivery to your address',
            fee: 49.99,
            freeThreshold: 999,
            available: true,
          },
        ]);
      } finally {
        // Only update loading state if not aborted
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchOptions();

    // Cleanup: abort pending request on unmount or dependency change
    return () => {
      abortController.abort();
    };
  }, [cart.items, cart.subtotal, customer, selectedFulfillment]);

  // Handle option selection
  const handleSelectOption = useCallback((option) => {
    setSelectedOption(option);
    setDeliveryAddress(null);
    setScheduleData(null);
  }, []);

  // Handle continue button
  const handleContinue = useCallback(() => {
    if (!selectedOption) return;

    if (selectedOption.type === 'local_delivery' || selectedOption.type === 'shipping') {
      // Need address input
      setStep('address');
    } else if (selectedOption.type === 'pickup_scheduled' || selectedOption.type === 'pickup_now') {
      // Need pickup details
      setStep('pickup');
    }
  }, [selectedOption, onComplete]);

  // Handle address completion
  const handleAddressComplete = useCallback(
    (address, validationResult) => {
      setDeliveryAddress(address);

      // Check if delivery needs scheduling
      if (selectedOption.requiresScheduling) {
        setStep('schedule');
      } else {
        // Complete with address
        onComplete({
          type: selectedOption.type,
          fee: validationResult?.fee ?? selectedOption.fee ?? 0,
          scheduledDate: null,
          scheduledTimeStart: null,
          scheduledTimeEnd: null,
          address: address,
          zoneId: validationResult?.zoneId || null,
          notes: null,
        });
      }
    },
    [selectedOption, onComplete]
  );

  // Handle schedule completion
  const handleScheduleComplete = useCallback(
    (schedule) => {
      setScheduleData(schedule);

      onComplete({
        type: selectedOption.type,
        fee: selectedOption.fee || 0,
        scheduledDate: schedule.date,
        scheduledTimeStart: schedule.startTime,
        scheduledTimeEnd: schedule.endTime,
        address: deliveryAddress,
        zoneId: schedule.zoneId || null,
        notes: schedule.notes || null,
      });
    },
    [selectedOption, deliveryAddress, onComplete]
  );

  // Handle pickup completion
  const handlePickupComplete = useCallback(
    (pickupData) => {
      onComplete(pickupData);
    },
    [onComplete]
  );

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (step === 'schedule' && selectedOption?.type === 'local_delivery') {
      setStep('address');
    } else {
      setStep('select');
    }
  }, [step, selectedOption]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500">Loading fulfillment options...</p>
      </div>
    );
  }

  // Error state
  if (error && options.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <ExclamationTriangleIcon className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-red-600 mb-4">{error}</p>
        <p className="text-sm text-gray-600">Please select a fulfillment option to continue.</p>
      </div>
    );
  }

  // Render based on step
  if (step === 'address') {
    return (
      <DeliveryAddressForm
        customer={customer}
        fulfillmentType={selectedOption?.type}
        onComplete={handleAddressComplete}
        onBack={handleBack}
      />
    );
  }

  if (step === 'pickup') {
    return (
      <PickupDetailsForm
        pickupType={selectedOption?.type}
        customer={customer}
        onComplete={handlePickupComplete}
        onBack={handleBack}
      />
    );
  }

  if (step === 'schedule') {
    return (
      <SchedulePicker
        optionType={selectedOption?.type}
        address={deliveryAddress}
        onComplete={handleScheduleComplete}
        onBack={handleBack}
      />
    );
  }

  // Main selection view
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">How would you like to receive your order?</h2>
        <p className="text-sm text-gray-500">Choose a fulfillment option</p>
      </div>

      {/* Options list */}
      <div className="flex-1 space-y-3 mb-6 overflow-y-auto">
        {options.map((option) => (
          <FulfillmentOptionCard
            key={option.type}
            option={option}
            isSelected={selectedOption?.type === option.type}
            onSelect={handleSelectOption}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedOption || selectedOption.available === false}
          className="
            flex-1 py-3 px-4
            flex items-center justify-center gap-2
            text-sm font-medium text-white
            bg-blue-600 hover:bg-blue-700
            disabled:bg-gray-300 disabled:cursor-not-allowed
            rounded-xl
            transition-colors duration-150
          "
        >
          Continue
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Selected option summary */}
      {selectedOption && selectedOption.fee > 0 && (
        <p className="text-center text-sm text-gray-500 mt-3">
          Delivery fee of {formatCurrency(selectedOption.fee)} will be added to your total
        </p>
      )}
    </div>
  );
}

export default FulfillmentSelector;
