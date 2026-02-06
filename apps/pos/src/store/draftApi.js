/**
 * Draft API Client
 * Handles communication with backend draft service
 */

import axios from '../api/axios';

const BASE_URL = '/api/drafts';

export const draftApi = {
  /**
   * Save or update a draft on the server
   */
  async saveDraft(draftData) {
    const response = await axios.post(BASE_URL, draftData);
    return response.data.data;
  },

  /**
   * Get a draft by ID
   */
  async getDraft(draftId) {
    const response = await axios.get(`${BASE_URL}/${draftId}`);
    return response.data.data;
  },

  /**
   * Get a draft by its unique key
   */
  async getDraftByKey(draftKey) {
    const response = await axios.get(`${BASE_URL}/key/${encodeURIComponent(draftKey)}`);
    return response.data.data;
  },

  /**
   * List drafts with optional filters
   */
  async listDrafts(options = {}) {
    const params = new URLSearchParams();

    if (options.draftType) params.append('draftType', options.draftType);
    if (options.deviceId) params.append('deviceId', options.deviceId);
    if (options.registerId) params.append('registerId', options.registerId);
    if (options.includeExpired) params.append('includeExpired', 'true');
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);

    const response = await axios.get(`${BASE_URL}?${params.toString()}`);
    return response.data;
  },

  /**
   * Delete a draft
   */
  async deleteDraft(draftId) {
    const response = await axios.delete(`${BASE_URL}/${draftId}`);
    return response.data.data;
  },

  /**
   * Mark a draft as completed
   */
  async completeDraft(draftId, notes = '') {
    const response = await axios.post(`${BASE_URL}/${draftId}/complete`, { notes });
    return response.data.data;
  },

  /**
   * Batch sync operations
   */
  async batchSync(operations, deviceId) {
    const response = await axios.post(`${BASE_URL}/sync`, {
      operations,
      deviceId,
    });
    return response.data.data;
  },

  /**
   * Get pending sync operations
   */
  async getPendingOperations(deviceId, limit = 100) {
    const params = new URLSearchParams();
    if (deviceId) params.append('deviceId', deviceId);
    params.append('limit', limit);

    const response = await axios.get(`${BASE_URL}/sync/pending?${params.toString()}`);
    return response.data.data;
  },

  /**
   * Mark a sync operation as completed
   */
  async completeOperation(operationId, success, errorMessage = null) {
    const response = await axios.post(`${BASE_URL}/sync/operation/${operationId}/complete`, {
      success,
      errorMessage,
    });
    return response.data.data;
  },
};

/**
 * Generate a unique device ID (persisted in localStorage)
 */
export const getDeviceId = () => {
  const DEVICE_ID_KEY = 'pos_device_id';
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
};

/**
 * Generate a unique draft key for the current session
 */
export const generateDraftKey = (draftType, userId) => {
  const deviceId = getDeviceId();
  return `${deviceId}:${userId || 'anon'}:${draftType}`;
};
