/**
 * TeleTime POS - Sales Rep Quick Select Component
 * Touch-friendly button grid for on-shift sales reps
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ============================================================================
// AVATAR COMPONENT
// ============================================================================

/**
 * Avatar with image or initials fallback
 */
function Avatar({ name, avatarUrl, size = 'md', isSelected = false }) {
  const [imageError, setImageError] = useState(false);

  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-14 h-14 text-base',
  };

  const getInitials = (fullName) => {
    if (!fullName) return '?';
    const parts = fullName.split(' ').filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const generateColor = (name) => {
    if (!name) return 'bg-gray-400';
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
      'bg-orange-500',
      'bg-cyan-500',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const showImage = avatarUrl && !imageError;
  const initials = getInitials(name);
  const bgColor = generateColor(name);

  return (
    <div
      className={`
        ${sizes[size]}
        rounded-full
        flex items-center justify-center
        font-semibold text-white
        overflow-hidden
        flex-shrink-0
        ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        ${showImage ? '' : bgColor}
      `}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

// ============================================================================
// SALES REP BUTTON
// ============================================================================

/**
 * Touch-friendly quick-select button for a salesperson
 * Minimum 48px tap target for accessibility
 */
function SalesRepButton({ rep, isSelected, onSelect, showStats = false }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(rep)}
      className={`
        relative flex flex-col items-center justify-center
        min-w-[80px] min-h-[80px] p-2
        rounded-xl border-2
        transition-all duration-150
        touch-manipulation
        ${isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100'
        }
      `}
      style={{ minHeight: '80px' }} /* Ensures 48px+ tap target */
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute -top-1.5 -right-1.5">
          <CheckCircleIcon className="w-5 h-5 text-blue-500 bg-white rounded-full" />
        </div>
      )}

      {/* Avatar */}
      <Avatar
        name={rep.name}
        avatarUrl={rep.avatarUrl}
        size="md"
        isSelected={isSelected}
      />

      {/* Name - First name only for compact display */}
      <span className={`mt-1.5 text-xs font-medium text-center truncate w-full px-1 ${
        isSelected ? 'text-blue-700' : 'text-gray-700'
      }`}>
        {rep.firstName || rep.name?.split(' ')[0] || 'User'}
      </span>

      {/* On-shift indicator OR sales stats */}
      {showStats && rep.salesToday > 0 ? (
        <span className="text-[10px] text-gray-500 mt-0.5">
          {rep.salesToday} sale{rep.salesToday !== 1 ? 's' : ''}
        </span>
      ) : rep.isOnShift ? (
        <span className="flex items-center gap-0.5 text-[10px] text-green-600 mt-0.5">
          <ClockIcon className="w-2.5 h-2.5" />
          <span>On Shift</span>
        </span>
      ) : null}
    </button>
  );
}

// ============================================================================
// OTHER BUTTON
// ============================================================================

/**
 * "Other" button to open full search modal
 */
function OtherButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        flex flex-col items-center justify-center
        min-w-[80px] min-h-[80px] p-2
        rounded-xl border-2 border-dashed
        border-gray-300 bg-gray-50
        hover:border-gray-400 hover:bg-gray-100
        active:bg-gray-200
        transition-all duration-150
        touch-manipulation
      "
      style={{ minHeight: '80px' }}
    >
      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
        <UserIcon className="w-6 h-6 text-gray-500" />
      </div>
      <span className="mt-1.5 text-xs font-medium text-gray-600">Other</span>
      <span className="text-[10px] text-gray-400">Search</span>
    </button>
  );
}

// ============================================================================
// SELECTED REP DISPLAY
// ============================================================================

/**
 * Compact display of currently selected salesperson
 */
function SelectedRepDisplay({ rep, onClear }) {
  if (!rep) return null;

  return (
    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg mb-2">
      <Avatar name={rep.name} avatarUrl={rep.avatarUrl} size="sm" isSelected />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-800 truncate">{rep.name}</p>
        <p className="text-xs text-blue-600 truncate">
          {rep.role}
          {rep.registerName && ` · ${rep.registerName}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-md transition-colors touch-manipulation"
        style={{ minWidth: '32px', minHeight: '32px' }}
      >
        <span className="text-xs font-medium">Clear</span>
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Sales Rep Quick Select Component
 * Touch-friendly grid of on-shift sales reps with "Other" option
 *
 * @param {object} props
 * @param {number|null} props.selectedId - Currently selected salesperson ID
 * @param {function} props.onSelect - Callback when salesperson is selected (id, rep)
 * @param {function} props.onOtherClick - Callback when "Other" button is clicked
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.showSelected - Whether to show selected rep display (default: true)
 * @param {number} props.maxQuickSelect - Maximum number of quick select buttons (default: 4)
 * @param {boolean} props.showStats - Whether to show sales stats on buttons (default: false)
 */
export function SalesRepQuickSelect({
  selectedId,
  onSelect,
  onOtherClick,
  className = '',
  showSelected = true,
  maxQuickSelect = 4,
  showStats = false,
}) {
  const [activeReps, setActiveReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRep, setSelectedRep] = useState(null);

  // Fetch active sales reps on mount
  useEffect(() => {
    fetchActiveReps();
  }, []);

  // Update selectedRep when selectedId changes
  useEffect(() => {
    if (selectedId && activeReps.length > 0) {
      const rep = activeReps.find(r => r.id === selectedId);
      if (rep) {
        setSelectedRep(rep);
      }
    } else if (!selectedId) {
      setSelectedRep(null);
    }
  }, [selectedId, activeReps]);

  const fetchActiveReps = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/pos/active-sales-reps?limit=15&includeStats=true`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch active reps');

      const data = await response.json();
      if (data.success && data.data?.reps) {
        setActiveReps(data.data.reps);

        // If we have a selectedId, find the rep
        if (selectedId) {
          const rep = data.data.reps.find(r => r.id === selectedId);
          if (rep) {
            setSelectedRep(rep);
          }
        }

        // Auto-select default rep if none selected
        if (!selectedId && data.data.defaultRepId) {
          const defaultRep = data.data.reps.find(r => r.id === data.data.defaultRepId);
          if (defaultRep) {
            setSelectedRep(defaultRep);
            onSelect(defaultRep.id, defaultRep);
          }
        }
      }
    } catch (error) {
      console.error('[SalesRepQuickSelect] Error fetching reps:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = useCallback((rep) => {
    setSelectedRep(rep);
    onSelect(rep ? rep.id : null, rep);
  }, [onSelect]);

  const handleClear = useCallback(() => {
    setSelectedRep(null);
    onSelect(null, null);
  }, [onSelect]);

  // Update selectedRep from external source (e.g., modal selection)
  const updateSelectedRep = useCallback((rep) => {
    setSelectedRep(rep);
    // Add to activeReps if not already there
    if (rep && !activeReps.find(r => r.id === rep.id)) {
      setActiveReps(prev => [...prev, rep]);
    }
  }, [activeReps]);

  // Expose updateSelectedRep for parent components
  useEffect(() => {
    if (window) {
      window.__updateSalesRep = updateSelectedRep;
    }
    return () => {
      if (window) {
        delete window.__updateSalesRep;
      }
    };
  }, [updateSelectedRep]);

  // Show first N reps
  const displayReps = useMemo(() => {
    return activeReps.slice(0, maxQuickSelect);
  }, [activeReps, maxQuickSelect]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-4 ${className}`}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <UserGroupIcon className="w-4 h-4 text-gray-500" />
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Sales Rep
        </span>
      </div>

      {/* Selected Rep Display */}
      {showSelected && selectedRep && (
        <SelectedRepDisplay rep={selectedRep} onClear={handleClear} />
      )}

      {/* Quick Select Grid */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-300">
        {displayReps.map((rep) => (
          <SalesRepButton
            key={rep.id}
            rep={rep}
            isSelected={selectedId === rep.id}
            onSelect={handleSelect}
            showStats={showStats}
          />
        ))}

        {/* "Other" Button */}
        <OtherButton onClick={onOtherClick} />
      </div>

      {/* No Reps Message */}
      {activeReps.length === 0 && (
        <p className="text-center text-xs text-gray-500 mt-2">
          No sales reps on shift.{' '}
          <button
            type="button"
            onClick={onOtherClick}
            className="text-blue-600 hover:underline touch-manipulation"
          >
            Search all
          </button>
        </p>
      )}
    </div>
  );
}

// Export Avatar for use in other components
export { Avatar };

export default SalesRepQuickSelect;
