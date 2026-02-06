/**
 * TeleTime POS - Sales Rep Search Modal
 * Full searchable list of all users
 */

import { useState, useEffect, useRef } from 'react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { Avatar } from './SalesRepQuickSelect';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ============================================================================
// SALES REP LIST ITEM
// ============================================================================

/**
 * Touch-friendly list item for sales rep selection
 */
function SalesRepListItem({ rep, isSelected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(rep)}
      className={`
        w-full flex items-center gap-3 p-3
        rounded-xl border-2
        transition-all duration-150
        touch-manipulation
        min-h-[64px]
        ${isSelected
          ? 'bg-blue-50 border-blue-500'
          : 'bg-white border-transparent hover:bg-gray-50 active:bg-gray-100'
        }
      `}
    >
      <Avatar
        name={rep.name}
        avatarUrl={rep.avatarUrl}
        size="md"
        isSelected={isSelected}
      />

      <div className="flex-1 text-left min-w-0">
        <p className={`font-medium truncate ${
          isSelected ? 'text-blue-700' : 'text-gray-900'
        }`}>
          {rep.name}
        </p>
        <p className="text-sm text-gray-500 truncate">
          {rep.role}
          {rep.department && ` · ${rep.department}`}
        </p>
      </div>

      {/* On-shift badge */}
      {rep.isOnShift && (
        <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full flex-shrink-0">
          <ClockIcon className="w-3 h-3" />
          On Shift
        </span>
      )}

      {/* Selected indicator */}
      {isSelected && (
        <CheckCircleIcon className="w-6 h-6 text-blue-500 flex-shrink-0" />
      )}
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Sales Rep Search Modal
 * Full-screen searchable list of all users
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {function} props.onClose - Callback to close modal
 * @param {function} props.onSelect - Callback when rep is selected (receives rep object)
 * @param {number|null} props.currentId - Currently selected salesperson ID
 */
export function SalesRepSearchModal({ isOpen, onClose, onSelect, currentId }) {
  const [search, setSearch] = useState('');
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setError(null);
      fetchAllReps();
      // Delay focus to ensure modal is rendered
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = setTimeout(() => {
      fetchAllReps(search);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, isOpen]);

  const fetchAllReps = async (searchQuery = '') => {
    try {
      setLoading(true);
      setError(null);

      const url = new URL(`${API_BASE}/pos/sales-reps/search`);
      if (searchQuery) {
        url.searchParams.set('q', searchQuery);
      }
      url.searchParams.set('limit', '50');

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch users');

      const data = await response.json();
      if (data.success && data.data?.reps) {
        setReps(data.data.reps);
      }
    } catch (err) {
      console.error('[SalesRepSearchModal] Error:', err);
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (rep) => {
    onSelect(rep);
    onClose();
  };

  const handleClearSelection = () => {
    onSelect(null);
    onClose();
  };

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 bg-white">
        <button
          type="button"
          onClick={onClose}
          className="
            p-2 -ml-2
            text-gray-500 hover:text-gray-700
            hover:bg-gray-100 active:bg-gray-200
            rounded-lg
            transition-colors
            touch-manipulation
          "
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        <h2 className="text-lg font-semibold text-gray-900 flex-1">
          Select Sales Rep
        </h2>

        {currentId && (
          <button
            type="button"
            onClick={handleClearSelection}
            className="
              px-3 py-2
              text-sm font-medium text-red-600
              hover:bg-red-50 active:bg-red-100
              rounded-lg
              transition-colors
              touch-manipulation
            "
            style={{ minHeight: '44px' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="
              w-full pl-10 pr-4 py-3
              text-base
              border border-gray-300 rounded-xl
              bg-white
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              placeholder:text-gray-400
            "
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="
                absolute right-3 top-1/2 -translate-y-1/2
                p-1 text-gray-400 hover:text-gray-600
                rounded-full hover:bg-gray-100
                touch-manipulation
              "
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 mb-3">{error}</p>
            <button
              type="button"
              onClick={() => fetchAllReps(search)}
              className="
                px-4 py-2
                text-blue-600 font-medium
                hover:bg-blue-50 active:bg-blue-100
                rounded-lg
                touch-manipulation
              "
            >
              Try Again
            </button>
          </div>
        ) : reps.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {search ? `No users found for "${search}"` : 'No users available'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* On-shift section */}
            {reps.some(r => r.isOnShift) && (
              <>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1 mb-2">
                  On Shift
                </p>
                {reps
                  .filter(r => r.isOnShift)
                  .map((rep) => (
                    <SalesRepListItem
                      key={rep.id}
                      rep={rep}
                      isSelected={currentId === rep.id}
                      onSelect={handleSelect}
                    />
                  ))}

                {reps.some(r => !r.isOnShift) && (
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1 mt-4 mb-2">
                    All Users
                  </p>
                )}
              </>
            )}

            {/* All users (or just users not on shift if there's an on-shift section) */}
            {reps
              .filter(r => !reps.some(x => x.isOnShift) || !r.isOnShift)
              .map((rep) => (
                <SalesRepListItem
                  key={rep.id}
                  rep={rep}
                  isSelected={currentId === rep.id}
                  onSelect={handleSelect}
                />
              ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <button
          type="button"
          onClick={onClose}
          className="
            w-full py-3
            text-gray-700 font-medium
            bg-white border border-gray-300
            hover:bg-gray-50 active:bg-gray-100
            rounded-xl
            transition-colors
            touch-manipulation
          "
          style={{ minHeight: '48px' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default SalesRepSearchModal;
