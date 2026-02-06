/**
 * Register & Shift API Service for TeleTime POS
 * Handles register management and shift operations
 */

import api from './axios';

/**
 * Get all registers with current status
 * @returns {Promise<object>} Registers list
 */
export const getRegisters = async () => {
  try {
    const response = await api.get('/registers');

    return {
      success: true,
      data: response.data || [],
    };
  } catch (error) {
    console.error('[Register] getRegisters error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Get a specific register by ID
 * @param {number} id - Register ID
 * @returns {Promise<object>} Register details
 */
export const getRegister = async (id) => {
  try {
    const response = await api.get(`/registers/${id}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Register] getRegister error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Open a new shift on a register
 * @param {number} registerId - Register ID
 * @param {number} openingCash - Opening cash amount
 * @returns {Promise<object>} Opened shift details
 */
export const openShift = async (registerId, openingCash) => {
  try {
    if (!registerId) {
      return {
        success: false,
        error: 'Register ID is required',
        data: null,
      };
    }

    if (openingCash === undefined || openingCash === null || openingCash < 0) {
      return {
        success: false,
        error: 'Valid opening cash amount is required',
        data: null,
      };
    }

    const response = await api.post('/registers/open', {
      registerId: parseInt(registerId, 10),
      openingCash: parseFloat(openingCash),
    });

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Register] openShift error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get shift summary with running totals
 * @param {number} shiftId - Shift ID
 * @returns {Promise<object>} Shift summary
 */
export const getShiftSummary = async (shiftId) => {
  try {
    const response = await api.get(`/registers/shift/${shiftId}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Register] getShiftSummary error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get transactions for a shift
 * @param {number} shiftId - Shift ID
 * @returns {Promise<object>} Shift transactions
 */
export const getShiftTransactions = async (shiftId) => {
  try {
    const response = await api.get(`/registers/shift/${shiftId}/transactions`);

    return {
      success: true,
      data: response.data || [],
    };
  } catch (error) {
    console.error('[Register] getShiftTransactions error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Close current shift with cash reconciliation
 * @param {number} shiftId - Shift ID
 * @param {number} closingCash - Counted cash amount
 * @param {string} notes - Optional notes
 * @returns {Promise<object>} Closing summary
 */
export const closeShift = async (shiftId, closingCash, notes = '') => {
  try {
    if (!shiftId) {
      return {
        success: false,
        error: 'Shift ID is required',
        data: null,
      };
    }

    if (closingCash === undefined || closingCash === null || closingCash < 0) {
      return {
        success: false,
        error: 'Valid closing cash amount is required',
        data: null,
      };
    }

    const response = await api.post('/registers/close', {
      shiftId: parseInt(shiftId, 10),
      closingCash: parseFloat(closingCash),
      notes: notes?.trim() || null,
    });

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Register] closeShift error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get the active shift for current user
 * @returns {Promise<object>} Active shift or null
 */
export const getActiveShift = async () => {
  try {
    const response = await api.get('/registers/active');

    return {
      success: true,
      data: response.data || null,
    };
  } catch (error) {
    console.error('[Register] getActiveShift error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Create a new register
 * @param {object} data - Register data
 * @param {string} data.registerName - Register name (required)
 * @param {string} data.location - Physical location
 * @returns {Promise<object>} Created register
 */
export const createRegister = async (data) => {
  try {
    if (!data.registerName || !data.registerName.trim()) {
      return {
        success: false,
        error: 'Register name is required',
        data: null,
      };
    }

    const response = await api.post('/registers', {
      registerName: data.registerName.trim(),
      location: data.location?.trim() || null,
    });

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Register] createRegister error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Update a register
 * @param {number} id - Register ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated register
 */
export const updateRegister = async (id, data) => {
  try {
    const response = await api.put(`/registers/${id}`, data);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Register] updateRegister error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Deactivate a register
 * @param {number} id - Register ID
 * @returns {Promise<object>} Result
 */
export const deactivateRegister = async (id) => {
  try {
    const response = await api.delete(`/registers/${id}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Register] deactivateRegister error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get available registers (active with no open shift)
 * @returns {Promise<object>} Available registers
 */
export const getAvailableRegisters = async () => {
  try {
    const response = await api.get('/registers');

    const available = (response.data || []).filter(
      (reg) => reg.isActive && !reg.currentShift
    );

    return {
      success: true,
      data: available,
    };
  } catch (error) {
    console.error('[Register] getAvailableRegisters error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

export default {
  getRegisters,
  getRegister,
  openShift,
  getShiftSummary,
  getShiftTransactions,
  closeShift,
  getActiveShift,
  createRegister,
  updateRegister,
  deactivateRegister,
  getAvailableRegisters,
};
