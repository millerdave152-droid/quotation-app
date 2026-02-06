/**
 * TeleTime POS - Schedule Picker Component
 * Date and time slot picker for scheduled pickup/delivery
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarIcon,
  ClockIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Format date for display
 */
function formatDateDisplay(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) {
    return 'Today';
  }
  if (date.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format time for display (24h to 12h)
 */
function formatTime(time24) {
  if (!time24) return '';

  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;

  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Date selector card component
 */
function DateCard({ date, isSelected, onSelect, disabled = false }) {
  const dateObj = new Date(date + 'T00:00:00');
  const dayName = dateObj.toLocaleDateString('en-CA', { weekday: 'short' });
  const dayNum = dateObj.getDate();
  const monthName = dateObj.toLocaleDateString('en-CA', { month: 'short' });

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center
        w-20 h-20 rounded-xl border-2
        transition-all duration-150
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span className="text-xs font-medium uppercase">{dayName}</span>
      <span className="text-2xl font-bold">{dayNum}</span>
      <span className="text-xs text-gray-500">{monthName}</span>
    </button>
  );
}

/**
 * Time slot button component
 */
function TimeSlotButton({ slot, isSelected, onSelect, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(slot)}
      disabled={disabled || !slot.available}
      className={`
        flex items-center justify-between
        px-4 py-3 rounded-lg border-2
        transition-all duration-150
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }
        ${!slot.available || disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className="flex items-center gap-2">
        <ClockIcon className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
        <span className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
          {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
        </span>
      </div>
      {isSelected && <CheckIcon className="w-5 h-5 text-blue-600" />}
      {!slot.available && (
        <span className="text-xs text-gray-400">Full</span>
      )}
    </button>
  );
}

/**
 * Schedule picker main component
 */
export function SchedulePicker({ optionType, address, onComplete, onBack }) {
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [dateStartIndex, setDateStartIndex] = useState(0);

  // Number of dates to show at once
  const VISIBLE_DATES = 5;

  // Fetch available dates
  useEffect(() => {
    const fetchDates = async () => {
      setLoadingDates(true);

      try {
        const params = new URLSearchParams({
          optionType: optionType || 'pickup_scheduled',
          daysAhead: '14',
        });

        const response = await fetch(`${API_BASE}/delivery/available-dates?${params}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
        });

        const result = await response.json();

        if (result.success && result.dates) {
          setAvailableDates(result.dates);
          // Auto-select first available date
          if (result.dates.length > 0) {
            setSelectedDate(result.dates[0]);
          }
        } else {
          // Generate default dates if API fails
          const dates = [];
          const today = new Date();
          for (let i = 0; i < 14; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            dates.push(date.toISOString().split('T')[0]);
          }
          setAvailableDates(dates);
          setSelectedDate(dates[0]);
        }
      } catch (err) {
        console.error('[SchedulePicker] Fetch dates error:', err);
        // Generate fallback dates
        const dates = [];
        const today = new Date();
        for (let i = 0; i < 14; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() + i);
          dates.push(date.toISOString().split('T')[0]);
        }
        setAvailableDates(dates);
        setSelectedDate(dates[0]);
      } finally {
        setLoadingDates(false);
      }
    };

    fetchDates();
  }, [optionType]);

  // Fetch time slots when date changes
  useEffect(() => {
    if (!selectedDate) return;

    const fetchSlots = async () => {
      setLoadingSlots(true);
      setSelectedSlot(null);

      try {
        const params = new URLSearchParams({
          date: selectedDate,
          optionType: optionType || 'pickup_scheduled',
        });

        const response = await fetch(`${API_BASE}/delivery/slots?${params}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
        });

        const result = await response.json();

        if (result.success && result.slots) {
          setTimeSlots(result.slots);
          // Auto-select first available slot
          const firstAvailable = result.slots.find((s) => s.available);
          if (firstAvailable) {
            setSelectedSlot(firstAvailable);
          }
        } else {
          // Generate default slots if API fails
          const defaultSlots = generateDefaultSlots();
          setTimeSlots(defaultSlots);
          setSelectedSlot(defaultSlots[0]);
        }
      } catch (err) {
        console.error('[SchedulePicker] Fetch slots error:', err);
        const defaultSlots = generateDefaultSlots();
        setTimeSlots(defaultSlots);
        setSelectedSlot(defaultSlots[0]);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedDate, optionType]);

  // Generate default time slots
  const generateDefaultSlots = useCallback(() => {
    const slots = [];
    const startHour = 9;
    const endHour = 18;
    const slotDuration = 2; // hours

    for (let hour = startHour; hour < endHour; hour += slotDuration) {
      slots.push({
        id: `slot_${hour}`,
        startTime: `${hour.toString().padStart(2, '0')}:00`,
        endTime: `${(hour + slotDuration).toString().padStart(2, '0')}:00`,
        available: true,
      });
    }

    return slots;
  }, []);

  // Visible dates for pagination
  const visibleDates = useMemo(() => {
    return availableDates.slice(dateStartIndex, dateStartIndex + VISIBLE_DATES);
  }, [availableDates, dateStartIndex]);

  // Pagination handlers
  const canScrollLeft = dateStartIndex > 0;
  const canScrollRight = dateStartIndex + VISIBLE_DATES < availableDates.length;

  const handleScrollLeft = useCallback(() => {
    setDateStartIndex((prev) => Math.max(0, prev - VISIBLE_DATES));
  }, []);

  const handleScrollRight = useCallback(() => {
    setDateStartIndex((prev) =>
      Math.min(availableDates.length - VISIBLE_DATES, prev + VISIBLE_DATES)
    );
  }, [availableDates.length]);

  // Handle date selection
  const handleDateSelect = useCallback((date) => {
    setSelectedDate(date);
  }, []);

  // Handle slot selection
  const handleSlotSelect = useCallback((slot) => {
    setSelectedSlot(slot);
  }, []);

  // Handle continue
  const handleContinue = useCallback(() => {
    if (!selectedDate || !selectedSlot) return;

    onComplete({
      date: selectedDate,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      slotId: selectedSlot.id,
      notes: notes.trim() || null,
    });
  }, [selectedDate, selectedSlot, notes, onComplete]);

  // Loading state
  if (loadingDates) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500">Loading available times...</p>
      </div>
    );
  }

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
        <h2 className="text-xl font-bold text-gray-900">
          {optionType === 'local_delivery' ? 'Schedule Delivery' : 'Schedule Pickup'}
        </h2>
        <p className="text-sm text-gray-500">Select a date and time</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Date Selection */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <CalendarIcon className="w-5 h-5 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Select Date</h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Left scroll button */}
            <button
              type="button"
              onClick={handleScrollLeft}
              disabled={!canScrollLeft}
              className={`
                p-2 rounded-lg
                ${
                  canScrollLeft
                    ? 'text-gray-600 hover:bg-gray-100'
                    : 'text-gray-300 cursor-not-allowed'
                }
              `}
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>

            {/* Date cards */}
            <div className="flex-1 flex gap-2 justify-center overflow-hidden">
              {visibleDates.map((date) => (
                <DateCard
                  key={date}
                  date={date}
                  isSelected={selectedDate === date}
                  onSelect={handleDateSelect}
                />
              ))}
            </div>

            {/* Right scroll button */}
            <button
              type="button"
              onClick={handleScrollRight}
              disabled={!canScrollRight}
              className={`
                p-2 rounded-lg
                ${
                  canScrollRight
                    ? 'text-gray-600 hover:bg-gray-100'
                    : 'text-gray-300 cursor-not-allowed'
                }
              `}
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Selected date display */}
          {selectedDate && (
            <p className="text-center text-sm text-gray-500 mt-2">
              {formatDateDisplay(selectedDate)}
            </p>
          )}
        </div>

        {/* Time Slots */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ClockIcon className="w-5 h-5 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Select Time</h3>
          </div>

          {loadingSlots ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : timeSlots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No time slots available for this date
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {timeSlots.map((slot) => (
                <TimeSlotButton
                  key={slot.id}
                  slot={slot}
                  isSelected={selectedSlot?.id === slot.id}
                  onSelect={handleSlotSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Special Instructions (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              optionType === 'local_delivery'
                ? 'Delivery instructions, gate code, etc.'
                : 'Any special requests...'
            }
            rows={2}
            className="
              w-full px-4 py-3 rounded-lg border border-gray-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              resize-none
            "
          />
        </div>
      </div>

      {/* Summary */}
      {selectedDate && selectedSlot && (
        <div className="bg-blue-50 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-blue-800">
            {optionType === 'local_delivery' ? 'Delivery' : 'Pickup'} scheduled for:
          </p>
          <p className="text-lg font-bold text-blue-900">
            {formatDateDisplay(selectedDate)}, {formatTime(selectedSlot.startTime)} -{' '}
            {formatTime(selectedSlot.endTime)}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedDate || !selectedSlot}
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
          Confirm Schedule
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default SchedulePicker;
