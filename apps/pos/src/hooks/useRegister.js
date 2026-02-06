/**
 * TeleTime POS - useRegister Hook
 * Enhanced register hook with additional utilities
 */

import { useCallback, useState, useRef } from 'react';
import { useRegister as useRegisterContext } from '../context/RegisterContext';
import * as transactionsApi from '../api/transactions';

/**
 * Enhanced register hook with additional utilities
 */
export function useRegister() {
  const register = useRegisterContext();
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Ref to avoid stale closure for register context
  const registerRef = useRef(register);
  registerRef.current = register;

  /**
   * Load transactions for current shift
   * FIXED: Uses ref to get LATEST register context, avoiding stale closure
   */
  const loadShiftTransactions = useCallback(async () => {
    const currentRegister = registerRef.current;
    if (!currentRegister.currentShift) return [];

    setLoadingTransactions(true);
    try {
      const txns = await currentRegister.getShiftTransactions();
      setTransactions(txns);
      return txns;
    } finally {
      setLoadingTransactions(false);
    }
  }, []); // No deps needed - use ref for latest values

  /**
   * Get daily summary for current shift
   * FIXED: Uses ref to get LATEST currentShift value
   */
  const getDailySummary = useCallback(async () => {
    const currentShift = registerRef.current.currentShift;
    if (!currentShift) return null;

    try {
      const shiftId = currentShift.shiftId || currentShift.shift_id;
      const response = await transactionsApi.getDailySummary({
        shiftId,
      });
      return response.data;
    } catch (err) {
      console.error('[useRegister] Failed to get daily summary:', err);
      return null;
    }
  }, []); // No deps - use ref

  /**
   * Void a transaction
   * @param {number} transactionId - Transaction ID
   * @param {string} reason - Void reason
   * FIXED: Uses ref to get LATEST register context
   */
  const voidTransaction = useCallback(
    async (transactionId, reason) => {
      try {
        const response = await transactionsApi.voidTransaction(transactionId, reason);

        if (response.success) {
          // Refresh shift summary and transactions using ref for latest context
          await registerRef.current.refreshShiftSummary();
          await loadShiftTransactions();
          return { success: true };
        }

        return { success: false, error: response.message };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    [loadShiftTransactions]
  );

  /**
   * Process a refund
   * @param {number} transactionId - Transaction ID
   * @param {object} refundData - Refund details
   * FIXED: Uses ref to get LATEST register context
   */
  const processRefund = useCallback(
    async (transactionId, refundData = {}) => {
      try {
        const response = await transactionsApi.refundTransaction(transactionId, refundData);

        if (response.success) {
          // Refresh shift summary and transactions using ref for latest context
          await registerRef.current.refreshShiftSummary();
          await loadShiftTransactions();
          return { success: true, data: response.data };
        }

        return { success: false, error: response.message };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    [loadShiftTransactions]
  );

  /**
   * Format shift duration
   */
  const getShiftDuration = useCallback(() => {
    if (!register.currentShift?.openedAt && !register.currentShift?.opened_at) return '';

    const openedAt = register.currentShift.openedAt || register.currentShift.opened_at;
    const start = new Date(openedAt);
    const now = new Date();
    const diff = now - start;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, [register.currentShift]);

  /**
   * Check if register is available (active and no open shift)
   * @param {number} registerId - Register ID
   */
  const isRegisterAvailable = useCallback(
    (registerId) => {
      const reg = register.registers.find(
        (r) => (r.registerId || r.register_id) === registerId
      );
      return reg && (reg.isActive || reg.is_active) && !reg.currentShift && !reg.current_shift;
    },
    [register.registers]
  );

  /**
   * Get available registers (active with no open shift)
   */
  const getAvailableRegisters = useCallback(() => {
    return register.registers.filter(
      (r) => (r.isActive || r.is_active) && !r.currentShift && !r.current_shift
    );
  }, [register.registers]);

  /**
   * Get registers currently in use
   */
  const getInUseRegisters = useCallback(() => {
    return register.registers.filter(
      (r) => (r.isActive || r.is_active) && (r.currentShift || r.current_shift)
    );
  }, [register.registers]);

  return {
    // State from context
    registers: register.registers,
    currentShift: register.currentShift,
    shiftSummary: register.shiftSummary,
    selectedRegister: register.selectedRegister,
    loading: register.loading,
    error: register.error,
    isInitialized: register.isInitialized,
    hasActiveShift: register.hasActiveShift,
    isRegisterOpen: register.isRegisterOpen,

    // Local state
    transactions,
    loadingTransactions,

    // Actions from context
    openShift: register.openShift,
    closeShift: register.closeShift,
    refreshRegisters: register.refreshRegisters,
    refreshShiftSummary: register.refreshShiftSummary,
    selectRegister: register.selectRegister,
    onTransactionComplete: register.onTransactionComplete,
    clearError: register.clearError,

    // Enhanced actions
    loadShiftTransactions,
    getDailySummary,
    voidTransaction,
    processRefund,

    // Utilities
    getShiftDuration,
    isRegisterAvailable,
    getAvailableRegisters,
    getInUseRegisters,
    getExpectedCash: register.getExpectedCash,
  };
}

export default useRegister;
