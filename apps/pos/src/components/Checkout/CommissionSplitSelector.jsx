/**
 * TeleTime POS - Commission Split Selector
 * Optional toggle to split commission between two salespersons
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { previewCommissionSplits } from '../../api/commissions';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const SPLIT_PRESETS = [
  { label: '50/50', primary: 50, secondary: 50 },
  { label: '60/40', primary: 60, secondary: 40 },
  { label: '70/30', primary: 70, secondary: 30 },
  { label: 'Custom', primary: null, secondary: null },
];

export function CommissionSplitSelector({
  salespersonId,
  salespersonName,
  commissionSplit,
  onSplitChange,
  cartTotal,
  cartItems,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);

  const enabled = commissionSplit?.enabled || false;
  const selectedPreset = commissionSplit?.preset || '50/50';
  const primaryPct = commissionSplit?.primaryPct ?? 50;
  const secondaryPct = commissionSplit?.secondaryPct ?? 50;
  const secondaryRepId = commissionSplit?.secondaryRepId || null;
  const secondaryRepName = commissionSplit?.secondaryRepName || '';

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowSearch(false);
        setSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!showSearch || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await fetch(
          `${API_BASE}/pos/sales-reps/search?q=${encodeURIComponent(searchQuery)}&limit=10`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }
        );
        const data = await response.json();
        if (data.success && data.data?.reps) {
          // Exclude the primary salesperson from results
          setSearchResults(data.data.reps.filter(r => r.id !== salespersonId));
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(searchRef.current);
  }, [searchQuery, showSearch, salespersonId]);

  // Preview commission when split config changes
  useEffect(() => {
    if (!enabled || !secondaryRepId || !cartTotal) {
      setPreviewData(null);
      return;
    }

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const result = await previewCommissionSplits({
          totalAmountCents: Math.round(cartTotal * 100),
          splits: [
            { userId: salespersonId, splitPercentage: primaryPct },
            { userId: secondaryRepId, splitPercentage: secondaryPct },
          ],
          cart: cartItems ? { items: cartItems } : undefined,
        });
        if (result.success) {
          setPreviewData(result.data);
        }
      } catch {
        setPreviewData(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [enabled, secondaryRepId, primaryPct, secondaryPct, cartTotal, salespersonId, cartItems]);

  const handleToggle = useCallback(() => {
    if (enabled) {
      onSplitChange(null);
    } else {
      onSplitChange({
        enabled: true,
        secondaryRepId: null,
        secondaryRepName: '',
        preset: '50/50',
        primaryPct: 50,
        secondaryPct: 50,
      });
    }
  }, [enabled, onSplitChange]);

  const handlePresetSelect = useCallback((preset) => {
    if (preset.primary !== null) {
      onSplitChange({
        ...commissionSplit,
        preset: preset.label,
        primaryPct: preset.primary,
        secondaryPct: preset.secondary,
      });
    } else {
      onSplitChange({
        ...commissionSplit,
        preset: 'Custom',
      });
    }
  }, [commissionSplit, onSplitChange]);

  const handleCustomPrimary = useCallback((val) => {
    const p = Math.max(1, Math.min(99, Number(val) || 50));
    onSplitChange({
      ...commissionSplit,
      preset: 'Custom',
      primaryPct: p,
      secondaryPct: 100 - p,
    });
  }, [commissionSplit, onSplitChange]);

  const handleSelectRep = useCallback((rep) => {
    onSplitChange({
      ...commissionSplit,
      secondaryRepId: rep.id,
      secondaryRepName: rep.name || `${rep.firstName || ''} ${rep.lastName || ''}`.trim(),
    });
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [commissionSplit, onSplitChange]);

  const handleClearRep = useCallback(() => {
    onSplitChange({
      ...commissionSplit,
      secondaryRepId: null,
      secondaryRepName: '',
    });
    setPreviewData(null);
  }, [commissionSplit, onSplitChange]);

  const formatCents = (cents) => `$${(Math.abs(cents || 0) / 100).toFixed(2)}`;

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Toggle Header */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-sm font-medium text-gray-700">Split Commission</span>
        </div>
        <div className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
      </button>

      {/* Split Configuration */}
      {enabled && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* Primary rep display */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                1
              </div>
              <span className="text-gray-700 font-medium">{salespersonName || 'You'}</span>
            </div>
            <span className="text-blue-600 font-bold">{primaryPct}%</span>
          </div>

          {/* Secondary rep selection */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                2
              </div>
              {secondaryRepId ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-gray-700 font-medium truncate">{secondaryRepName}</span>
                  <button
                    type="button"
                    onClick={handleClearRep}
                    className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <div className="relative flex-1" ref={dropdownRef}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearch(true);
                    }}
                    onFocus={() => setShowSearch(true)}
                    placeholder="Search rep..."
                    className="w-full bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {searchLoading && (
                    <div className="absolute right-2 top-2">
                      <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {showSearch && searchResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {searchResults.map(rep => (
                        <button
                          key={rep.id}
                          type="button"
                          onClick={() => handleSelectRep(rep)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0"
                        >
                          <span className="font-medium text-gray-800">
                            {rep.name || `${rep.firstName || ''} ${rep.lastName || ''}`.trim()}
                          </span>
                          {rep.isOnShift && (
                            <span className="ml-2 text-xs text-green-600">On shift</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {secondaryRepId && (
              <span className="text-purple-600 font-bold ml-2">{secondaryPct}%</span>
            )}
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1.5">
            {SPLIT_PRESETS.map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                  selectedPreset === preset.label
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom slider */}
          {selectedPreset === 'Custom' && (
            <div className="space-y-1">
              <input
                type="range"
                min="10"
                max="90"
                value={primaryPct}
                onChange={(e) => handleCustomPrimary(e.target.value)}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>{salespersonName || 'Primary'}: {primaryPct}%</span>
                <span>{secondaryRepName || 'Secondary'}: {secondaryPct}%</span>
              </div>
            </div>
          )}

          {/* Commission Preview */}
          {secondaryRepId && previewData && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Commission Preview</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{salespersonName || 'Primary'} ({primaryPct}%)</span>
                <span className="font-medium text-gray-900">
                  {formatCents(previewData.splits?.[0]?.commissionAmountCents)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{secondaryRepName} ({secondaryPct}%)</span>
                <span className="font-medium text-gray-900">
                  {formatCents(previewData.splits?.[1]?.commissionAmountCents)}
                </span>
              </div>
              <div className="flex justify-between text-xs border-t border-gray-200 pt-1.5 mt-1.5">
                <span className="text-gray-500">Total commission</span>
                <span className="font-medium text-gray-700">{formatCents(previewData.baseCommissionCents)}</span>
              </div>
            </div>
          )}

          {secondaryRepId && previewLoading && (
            <div className="text-center py-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {enabled && !secondaryRepId && (
            <p className="text-xs text-amber-600">Select a second salesperson to apply the split</p>
          )}
        </div>
      )}
    </div>
  );
}

export default CommissionSplitSelector;
