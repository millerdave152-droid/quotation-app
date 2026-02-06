/**
 * TeleTime POS - Register Select Component
 * Shows available registers for selection when no active shift exists
 */

import { useState, useEffect } from 'react';
import {
  ComputerDesktopIcon,
  UserIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { useRegister } from '../../context/RegisterContext';
import { formatDateTime } from '../../utils/formatters';

/**
 * Register card component
 */
function RegisterCard({ register, onSelect, isSelected }) {
  const {
    registerId,
    registerName,
    location,
    isActive,
    currentShift,
  } = register;

  const isInUse = !!currentShift;
  const currentUser = currentShift?.userName || currentShift?.user_name;
  const openedAt = currentShift?.openedAt || currentShift?.opened_at;

  return (
    <button
      type="button"
      onClick={() => !isInUse && onSelect(register)}
      disabled={isInUse || !isActive}
      className={`
        w-full p-6
        flex items-start gap-4
        text-left
        border-2 rounded-2xl
        transition-all duration-200
        ${isSelected
          ? 'border-blue-500 bg-blue-50 shadow-lg'
          : isInUse
            ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
            : !isActive
              ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
              : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md cursor-pointer'
        }
      `}
    >
      {/* Register Icon */}
      <div className={`
        w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0
        ${isSelected
          ? 'bg-blue-500 text-white'
          : isInUse
            ? 'bg-yellow-100 text-yellow-600'
            : !isActive
              ? 'bg-gray-200 text-gray-400'
              : 'bg-blue-100 text-blue-600'
        }
      `}>
        <ComputerDesktopIcon className="w-7 h-7" />
      </div>

      {/* Register Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-bold text-gray-900">{registerName}</h3>
          {isInUse && (
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
              In Use
            </span>
          )}
          {!isActive && (
            <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs font-medium rounded-full">
              Inactive
            </span>
          )}
          {isSelected && (
            <CheckCircleIcon className="w-5 h-5 text-blue-500" />
          )}
        </div>

        {location && (
          <p className="text-sm text-gray-500 mb-2">{location}</p>
        )}

        {isInUse && currentUser && (
          <div className="flex items-center gap-2 text-sm text-yellow-700">
            <UserIcon className="w-4 h-4" />
            <span>
              Opened by <strong>{currentUser}</strong>
              {openedAt && ` at ${formatDateTime(openedAt)}`}
            </span>
          </div>
        )}

        {!isInUse && isActive && (
          <p className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircleIcon className="w-4 h-4" />
            Available
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * Register select component
 * @param {object} props
 * @param {function} props.onSelectRegister - Callback when register is selected
 */
export function RegisterSelect({ onSelectRegister }) {
  const { registers, loading, error, refreshRegisters } = useRegister();
  const [selectedRegister, setSelectedRegister] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter active registers
  const activeRegisters = registers.filter(r => r.isActive || r.is_active);
  const availableRegisters = activeRegisters.filter(r => !r.currentShift && !r.current_shift);
  const inUseRegisters = activeRegisters.filter(r => r.currentShift || r.current_shift);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshRegisters();
    setIsRefreshing(false);
  };

  // Handle register selection
  const handleSelectRegister = (register) => {
    setSelectedRegister(register);
  };

  // Handle continue
  const handleContinue = () => {
    if (selectedRegister) {
      onSelectRegister(selectedRegister);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading registers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 text-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {import.meta.env.VITE_APP_NAME || 'TeleTime POS'}
            </h1>
            <p className="text-slate-400 text-sm">Select a register to begin</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="
              flex items-center gap-2
              px-4 py-2
              bg-slate-700 hover:bg-slate-600
              rounded-lg
              transition-colors
            "
          >
            <ArrowPathIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-500 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-red-800">Error Loading Registers</h3>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Available Registers */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full" />
              Available Registers ({availableRegisters.length})
            </h2>

            {availableRegisters.length === 0 ? (
              <div className="p-8 bg-white rounded-2xl border-2 border-dashed border-gray-300 text-center">
                <ComputerDesktopIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No registers available</p>
                <p className="text-sm text-gray-500">All registers are currently in use or inactive</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {availableRegisters.map((register) => (
                  <RegisterCard
                    key={register.registerId || register.register_id || register.id}
                    register={register}
                    onSelect={handleSelectRegister}
                    isSelected={selectedRegister?.registerId === register.registerId}
                  />
                ))}
              </div>
            )}
          </section>

          {/* In Use Registers */}
          {inUseRegisters.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-3 h-3 bg-yellow-500 rounded-full" />
                Currently In Use ({inUseRegisters.length})
              </h2>

              <div className="grid gap-4 md:grid-cols-2">
                {inUseRegisters.map((register) => (
                  <RegisterCard
                    key={register.registerId || register.register_id || register.id}
                    register={register}
                    onSelect={() => {}}
                    isSelected={false}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer - Continue Button */}
      <footer className="bg-white border-t border-gray-200 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={handleContinue}
            disabled={!selectedRegister}
            className="
              w-full h-14
              flex items-center justify-center gap-2
              bg-blue-600 hover:bg-blue-700
              disabled:bg-gray-300 disabled:cursor-not-allowed
              text-white text-lg font-bold
              rounded-xl
              transition-colors
            "
          >
            {selectedRegister ? (
              <>
                Continue with {selectedRegister.registerName}
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            ) : (
              'Select a Register to Continue'
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

export default RegisterSelect;
