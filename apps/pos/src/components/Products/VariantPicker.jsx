/**
 * TeleTime POS - Variant Picker
 *
 * Overlay for selecting product variants (color, size, finish, etc.)
 * when a parent product is tapped at POS. Calls the picker-state API
 * on mount and on every attribute selection change.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Skeleton,
} from '@mui/material';
import api from '../../api/axios';
import { formatCents } from '../../utils/formatCents';
import { AlertTriangle, X } from 'lucide-react';

// Kleonik Copper — primary accent for active/CTA states
const COPPER = '#C8614A';
const COPPER_LIGHT = '#C8614A1A'; // 10% opacity

// ============================================================================
// SWATCH RENDERER
// ============================================================================

function SwatchGroup({ attribute, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2">
      {attribute.values.map((v) => {
        const selected = v.isSelected;
        const disabled = !v.isSelectable;

        return (
          <button
            key={v.valueId}
            type="button"
            title={v.label}
            disabled={disabled}
            onClick={() => !disabled && onSelect(attribute.attributeId, v.valueId)}
            className="relative w-10 h-10 rounded-full border-2 transition-all focus:outline-none"
            style={{
              backgroundColor: v.colorHex || '#E5E7EB',
              borderColor: selected ? COPPER : 'transparent',
              boxShadow: selected ? `0 0 0 2px ${COPPER}` : 'none',
              opacity: disabled ? 0.4 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {selected && (
              <span
                className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                style={{ color: isLightColor(v.colorHex) ? '#000' : '#fff' }}
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// BUTTON (PILL) RENDERER
// ============================================================================

function ButtonGroup({ attribute, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2">
      {attribute.values.map((v) => {
        const selected = v.isSelected;
        const disabled = !v.isSelectable;

        return (
          <button
            key={v.valueId}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onSelect(attribute.attributeId, v.valueId)}
            className="px-4 py-1.5 rounded-full text-sm font-medium border transition-all focus:outline-none"
            style={{
              backgroundColor: selected ? COPPER : '#fff',
              color: selected ? '#fff' : disabled ? '#9CA3AF' : '#374151',
              borderColor: selected ? COPPER : '#D1D5DB',
              opacity: disabled ? 0.4 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// DROPDOWN RENDERER
// ============================================================================

function DropdownGroup({ attribute, onSelect }) {
  const selectedValue = attribute.values.find((v) => v.isSelected);

  return (
    <FormControl fullWidth size="small">
      <InputLabel>{attribute.attributeName}</InputLabel>
      <Select
        value={selectedValue?.valueId ?? ''}
        label={attribute.attributeName}
        onChange={(e) => onSelect(attribute.attributeId, e.target.value)}
      >
        {attribute.values.map((v) => (
          <MenuItem key={v.valueId} value={v.valueId} disabled={!v.isSelectable}>
            <span style={{ opacity: v.isSelectable ? 1 : 0.4 }}>{v.label}</span>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

// ============================================================================
// SKELETON PLACEHOLDER
// ============================================================================

function PickerSkeleton() {
  return (
    <div className="space-y-5 py-2">
      {[1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton variant="text" width={80} height={20} />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((j) => (
              <Skeleton key={j} variant="circular" width={40} height={40} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/** Returns true if a hex color is light enough to need dark text */
function isLightColor(hex) {
  if (!hex) return true;
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VariantPicker({
  parentProductId,
  locationId,
  onVariantSelected,
  onClose,
}) {
  // Map of attributeId → selected valueId
  const [selectedValues, setSelectedValues] = useState({});
  const [pickerState, setPickerState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // -------------------------------------------------------------------------
  // Fetch picker state
  // -------------------------------------------------------------------------

  const fetchPickerState = useCallback(
    async (currentSelections) => {
      setLoading(true);
      setError(null);

      try {
        const valueIds = Object.values(currentSelections).filter(Boolean);
        const params = new URLSearchParams({ locationId });
        if (valueIds.length > 0) {
          params.set('selectedValues', valueIds.join(','));
        }

        const res = await api.get(
          `/products/${parentProductId}/picker-state?${params}`
        );
        // axios interceptor returns response.data; handle both shapes
        const data = res?.data ?? res;
        setPickerState(data);
      } catch (err) {
        setError(err?.response?.data?.message || err.message || 'Failed to load variants');
      } finally {
        setLoading(false);
      }
    },
    [parentProductId, locationId]
  );

  // Fetch on mount
  useEffect(() => {
    fetchPickerState({});
  }, [fetchPickerState]);

  // -------------------------------------------------------------------------
  // Selection handler
  // -------------------------------------------------------------------------

  const handleSelect = useCallback(
    (attributeId, valueId) => {
      setSelectedValues((prev) => {
        const next = { ...prev };
        // Toggle off if clicking same value again
        if (prev[attributeId] === valueId) {
          delete next[attributeId];
        } else {
          next[attributeId] = valueId;
        }
        fetchPickerState(next);
        return next;
      });
    },
    [fetchPickerState]
  );

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const {
    availableAttributes = [],
    matchedVariant,
    isComplete,
    inventoryAtLocation,
  } = pickerState || {};

  // Determine which attribute is still missing (for helper text)
  const missingAttributeName = useMemo(() => {
    if (!availableAttributes.length) return null;
    const missing = availableAttributes.find(
      (attr) => !attr.values.some((v) => v.isSelected)
    );
    return missing?.attributeName || null;
  }, [availableAttributes]);

  // Edge case: all attrs selected but no variant exists
  const allSelectedButNoMatch =
    availableAttributes.length > 0 &&
    !missingAttributeName &&
    !matchedVariant &&
    !loading;

  const qtyAvailable = inventoryAtLocation?.qty_available ?? 0;
  const outOfStock = isComplete && matchedVariant && qtyAvailable === 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          maxWidth: 480,
          width: '100%',
          borderRadius: '16px',
          m: 2,
        },
      }}
    >
      {/* Header */}
      <DialogTitle className="flex items-center justify-between pr-2">
        <span className="text-lg font-semibold text-gray-900 truncate">
          Select Variant
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </DialogTitle>

      <DialogContent dividers className="space-y-5 !pt-4">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !pickerState && <PickerSkeleton />}

        {/* Attribute groups */}
        {availableAttributes.map((attr) => (
          <div key={attr.attributeId} className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {attr.attributeName}
            </label>

            {attr.displayMode === 'swatch' ? (
              <SwatchGroup attribute={attr} onSelect={handleSelect} />
            ) : attr.displayMode === 'dropdown' ? (
              <DropdownGroup attribute={attr} onSelect={handleSelect} />
            ) : (
              <ButtonGroup attribute={attr} onSelect={handleSelect} />
            )}
          </div>
        ))}

        {/* Inline skeleton during re-fetch (layout-stable) */}
        {loading && pickerState && (
          <div className="flex items-center gap-2 pt-1">
            <Skeleton variant="circular" width={16} height={16} />
            <Skeleton variant="text" width={120} height={16} />
          </div>
        )}

        {/* Invalid combination message */}
        {allSelectedButNoMatch && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            This combination isn&apos;t available
          </div>
        )}

        {/* Matched variant summary */}
        {isComplete && matchedVariant && (
          <div
            className="p-3 rounded-lg border space-y-1"
            style={{ borderColor: COPPER, backgroundColor: COPPER_LIGHT }}
          >
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-semibold text-gray-900">
                {matchedVariant.variant_sku || matchedVariant.sku || matchedVariant.model}
              </span>
              <span className="text-base font-bold text-gray-900">
                {formatCents(matchedVariant.price)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>
                Stock:{' '}
                <span
                  className={
                    qtyAvailable > 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'
                  }
                >
                  {qtyAvailable} available
                </span>
              </span>
              {inventoryAtLocation?.qty_reserved > 0 && (
                <span>({inventoryAtLocation.qty_reserved} reserved)</span>
              )}
            </div>
          </div>
        )}
      </DialogContent>

      {/* Footer */}
      <DialogActions className="!px-6 !py-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>

        {outOfStock ? (
          <button
            type="button"
            onClick={() => onVariantSelected(matchedVariant, inventoryAtLocation)}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors"
            style={{ backgroundColor: '#DC2626' }}
          >
            Out of Stock — Add Anyway?
          </button>
        ) : (
          <button
            type="button"
            disabled={!isComplete || !matchedVariant || allSelectedButNoMatch}
            onClick={() =>
              isComplete &&
              matchedVariant &&
              onVariantSelected(matchedVariant, inventoryAtLocation)
            }
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor:
                isComplete && matchedVariant ? COPPER : '#9CA3AF',
            }}
          >
            {!isComplete && missingAttributeName
              ? `Select ${missingAttributeName}`
              : allSelectedButNoMatch
                ? 'Unavailable'
                : 'Add to Cart'}
          </button>
        )}
      </DialogActions>
    </Dialog>
  );
}
