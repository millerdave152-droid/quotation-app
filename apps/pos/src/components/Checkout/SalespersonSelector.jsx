/**
 * TeleTime POS - Salesperson Selector Component
 * Composes SalesRepQuickSelect and SalesRepSearchModal
 */

import { useState, useCallback } from 'react';
import { SalesRepQuickSelect } from './SalesRepQuickSelect';
import { SalesRepSearchModal } from './SalesRepSearchModal';

/**
 * Salesperson Selector Component
 * Combines quick-select grid with full search modal
 *
 * @param {object} props
 * @param {number|null} props.selectedId - Currently selected salesperson ID
 * @param {function} props.onSelect - Callback when salesperson is selected (id, rep)
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.showSelected - Whether to show selected rep display (default: true)
 * @param {number} props.maxQuickSelect - Maximum quick select buttons (default: 4)
 */
export function SalespersonSelector({
  selectedId,
  onSelect,
  className = '',
  showSelected = true,
  maxQuickSelect = 4,
}) {
  const [showModal, setShowModal] = useState(false);

  const handleSelect = useCallback((id, rep) => {
    onSelect(id, rep);
  }, [onSelect]);

  const handleModalSelect = useCallback((rep) => {
    if (rep) {
      onSelect(rep.id, rep);
      // Update the quick select component if it has the global updater
      if (window.__updateSalesRep) {
        window.__updateSalesRep(rep);
      }
    } else {
      onSelect(null, null);
    }
  }, [onSelect]);

  return (
    <>
      <SalesRepQuickSelect
        selectedId={selectedId}
        onSelect={handleSelect}
        onOtherClick={() => setShowModal(true)}
        className={className}
        showSelected={showSelected}
        maxQuickSelect={maxQuickSelect}
      />

      <SalesRepSearchModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSelect={handleModalSelect}
        currentId={selectedId}
      />
    </>
  );
}

export default SalespersonSelector;
