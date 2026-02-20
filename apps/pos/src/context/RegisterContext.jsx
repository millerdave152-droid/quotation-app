/**
 * TeleTime POS - Register Context
 * Manages register state, shifts, and provides localStorage persistence
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import * as registerApi from '../api/register';
import errorTracker from '../services/ErrorTracker';

const RegisterContext = createContext(null);

// LocalStorage keys
const STORAGE_KEYS = {
  CURRENT_SHIFT: 'pos_current_shift',
  SELECTED_REGISTER: 'pos_selected_register',
};

/**
 * Load data from localStorage with JSON parsing
 */
function loadFromStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error(`[RegisterContext] Failed to load ${key} from storage:`, err);
    return null;
  }
}

/**
 * Save data to localStorage with JSON stringification
 */
function saveToStorage(key, data) {
  try {
    if (data === null || data === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (err) {
    console.error(`[RegisterContext] Failed to save ${key} to storage:`, err);
  }
}

export function RegisterProvider({ children }) {
  const { isAuthenticated, user } = useAuth();

  // State
  const [registers, setRegisters] = useState([]);
  const [currentShift, setCurrentShift] = useState(null);
  const [shiftSummary, setShiftSummary] = useState(null);
  const [selectedRegister, setSelectedRegister] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Computed
  const hasActiveShift = !!currentShift;
  const isRegisterOpen = hasActiveShift;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  // Initialize register state (defined before useEffect that uses it)
  const initializeRegister = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Try to recover from localStorage first
      const storedShift = loadFromStorage(STORAGE_KEYS.CURRENT_SHIFT);
      const storedRegister = loadFromStorage(STORAGE_KEYS.SELECTED_REGISTER);

      // Fetch registers and verify active shift from server
      const [registersRes, activeShiftRes] = await Promise.all([
        registerApi.getRegisters(),
        registerApi.getActiveShift(),
      ]);

      // Update registers
      if (registersRes.data) {
        setRegisters(registersRes.data);
      }

      // Check if there's an active shift from the server
      if (activeShiftRes.data) {
        const serverShift = activeShiftRes.data;
        setCurrentShift(serverShift);
        saveToStorage(STORAGE_KEYS.CURRENT_SHIFT, serverShift);

        // Find and set the selected register
        const register = registersRes.data?.find(
          r => (r.registerId || r.register_id) === (serverShift.registerId || serverShift.register_id)
        );
        if (register) {
          setSelectedRegister(register);
          saveToStorage(STORAGE_KEYS.SELECTED_REGISTER, register);
        }

        // Fetch detailed summary for active shift
        const shiftId = serverShift.shiftId || serverShift.shift_id;
        try {
          const summaryRes = await registerApi.getShiftSummary(shiftId);
          if (summaryRes.data) {
            setShiftSummary(summaryRes.data);
          }
        } catch (summaryErr) {
          console.error('[RegisterContext] Failed to fetch shift summary:', summaryErr);
        }
      } else if (storedShift) {
        // No server shift but we have stored shift - it may have been closed elsewhere
        // Verify the stored shift is still valid
        try {
          const verifyRes = await registerApi.getShiftSummary(storedShift.shiftId || storedShift.shift_id);
          if (verifyRes.data && !verifyRes.data.closedAt) {
            // Shift is still open
            setCurrentShift(storedShift);
            setSelectedRegister(storedRegister);
          } else {
            // Shift was closed, clear storage
            saveToStorage(STORAGE_KEYS.CURRENT_SHIFT, null);
            saveToStorage(STORAGE_KEYS.SELECTED_REGISTER, null);
          }
        } catch {
          // Shift doesn't exist or error - clear storage
          saveToStorage(STORAGE_KEYS.CURRENT_SHIFT, null);
          saveToStorage(STORAGE_KEYS.SELECTED_REGISTER, null);
        }
      }

      setIsInitialized(true);
    } catch (err) {
      console.error('[RegisterContext] Failed to initialize:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize on auth change
  useEffect(() => {
    if (isAuthenticated) {
      initializeRegister();
    } else {
      // Clear state on logout
      setRegisters([]);
      setCurrentShift(null);
      setShiftSummary(null);
      setSelectedRegister(null);
      setLoading(false);
      setIsInitialized(false);

      // Clear localStorage
      saveToStorage(STORAGE_KEYS.CURRENT_SHIFT, null);
      saveToStorage(STORAGE_KEYS.SELECTED_REGISTER, null);
    }
  }, [isAuthenticated, initializeRegister]);

  // ============================================================================
  // REGISTER OPERATIONS
  // ============================================================================

  // Refresh registers list
  const refreshRegisters = useCallback(async () => {
    try {
      const response = await registerApi.getRegisters();
      if (response.data) {
        setRegisters(response.data);
      }
      return { success: true, data: response.data };
    } catch (err) {
      console.error('[RegisterContext] Failed to refresh registers:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Select a register (before opening)
  const selectRegister = useCallback((register) => {
    setSelectedRegister(register);
    saveToStorage(STORAGE_KEYS.SELECTED_REGISTER, register);
  }, []);

  // ============================================================================
  // SHIFT OPERATIONS
  // ============================================================================

  // Refresh shift summary
  const refreshShiftSummary = useCallback(async (shiftId) => {
    const id = shiftId || currentShift?.shiftId || currentShift?.shift_id;
    if (!id) return { success: false, error: 'No shift ID' };

    try {
      const response = await registerApi.getShiftSummary(id);
      if (response.data) {
        setShiftSummary(response.data);
        return { success: true, data: response.data };
      }
      return { success: false, error: 'No data returned' };
    } catch (err) {
      console.error('[RegisterContext] Failed to refresh shift summary:', err);
      return { success: false, error: err.message };
    }
  }, [currentShift]);

  // Open a new shift
  const openShift = useCallback(async (registerId, openingCash) => {
    setError(null);

    try {
      const response = await registerApi.openShift(registerId, openingCash);

      if (response.success && response.data) {
        const newShift = response.data;

        // Update state
        setCurrentShift(newShift);
        saveToStorage(STORAGE_KEYS.CURRENT_SHIFT, newShift);
        errorTracker.setMeta({ shiftId: newShift.shiftId || newShift.shift_id });

        // Refresh registers to update status
        await refreshRegisters();

        // Initialize shift summary
        setShiftSummary({
          ...newShift,
          summary: {
            transactionCount: 0,
            voidCount: 0,
            refundCount: 0,
            totalSales: 0,
            refundTotal: 0,
            paymentBreakdown: {},
          },
        });

        return { success: true, data: newShift };
      }

      throw new Error(response.message || 'Failed to open shift');
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [refreshRegisters]);

  // Close current shift
  const closeShift = useCallback(async (closingCash, notes = '') => {
    if (!currentShift) {
      return { success: false, error: 'No active shift to close' };
    }

    setError(null);

    try {
      const shiftId = currentShift.shiftId || currentShift.shift_id;
      const response = await registerApi.closeShift(shiftId, closingCash, notes);

      if (response.success && response.data) {
        const closingData = response.data;

        // Clear state
        setCurrentShift(null);
        setShiftSummary(null);
        setSelectedRegister(null);
        errorTracker.setMeta({ shiftId: null });

        // Clear localStorage
        saveToStorage(STORAGE_KEYS.CURRENT_SHIFT, null);
        saveToStorage(STORAGE_KEYS.SELECTED_REGISTER, null);

        // Refresh registers
        await refreshRegisters();

        return { success: true, data: closingData };
      }

      throw new Error(response.message || 'Failed to close shift');
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [currentShift, refreshRegisters]);

  // Get shift transactions
  const getShiftTransactions = useCallback(async () => {
    if (!currentShift) return [];

    try {
      const shiftId = currentShift.shiftId || currentShift.shift_id;
      const response = await registerApi.getShiftTransactions(shiftId);
      return response.data || [];
    } catch (err) {
      console.error('[RegisterContext] Failed to get shift transactions:', err);
      return [];
    }
  }, [currentShift]);

  // Update summary after a transaction
  const onTransactionComplete = useCallback(async () => {
    if (currentShift) {
      const shiftId = currentShift.shiftId || currentShift.shift_id;
      await refreshShiftSummary(shiftId);
    }
  }, [currentShift, refreshShiftSummary]);

  // ============================================================================
  // CASH CALCULATIONS
  // ============================================================================

  // Calculate expected cash in drawer
  const getExpectedCash = useCallback(() => {
    if (!currentShift || !shiftSummary) return 0;

    const openingCash = currentShift.openingCash || currentShift.opening_cash || 0;
    const cashSales = shiftSummary.summary?.paymentBreakdown?.cash?.total || 0;
    const cashRefunds = shiftSummary.summary?.cashRefunds || 0;

    return openingCash + cashSales - cashRefunds;
  }, [currentShift, shiftSummary]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value = {
    // State
    registers,
    currentShift,
    shiftSummary,
    selectedRegister,
    loading,
    error,
    isInitialized,

    // Computed
    hasActiveShift,
    isRegisterOpen,

    // Register operations
    refreshRegisters,
    selectRegister,

    // Shift operations
    openShift,
    closeShift,
    refreshShiftSummary: () => refreshShiftSummary(),
    getShiftTransactions,
    onTransactionComplete,

    // Cash operations
    getExpectedCash,

    // Error handling
    clearError: () => setError(null),
  };

  return (
    <RegisterContext.Provider value={value}>
      {children}
    </RegisterContext.Provider>
  );
}

export function useRegister() {
  const context = useContext(RegisterContext);
  if (!context) {
    throw new Error('useRegister must be used within a RegisterProvider');
  }
  return context;
}

export default RegisterContext;
