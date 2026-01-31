/**
 * Configured Axios Instance for TeleTime POS
 * Handles authentication, error handling, and request/response interceptors
 */

import axios from 'axios';

// Storage keys
const TOKEN_KEY = 'pos_token';
const USER_KEY = 'pos_user';

// Create axios instance with default config
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================================================
// REQUEST INTERCEPTOR
// Add Authorization header with JWT from localStorage
// ============================================================================

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Log requests in development
    if (import.meta.env.DEV) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    }

    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// ============================================================================
// RESPONSE INTERCEPTOR
// Handle 401 (redirect to login), handle network errors
// ============================================================================

api.interceptors.response.use(
  (response) => {
    // Return response data directly for cleaner usage
    return response.data;
  },
  (error) => {
    const { response, request, message } = error;

    // Handle response errors (server responded with error status)
    if (response) {
      const { status, data } = response;

      // 401 Unauthorized - Token expired or invalid
      if (status === 401) {
        console.warn('[API] Unauthorized - clearing auth and redirecting to login');

        // Clear stored auth data
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);

        // Redirect to login if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }

        return Promise.reject({
          status: 401,
          message: data?.message || 'Session expired. Please log in again.',
          code: 'UNAUTHORIZED',
        });
      }

      // 403 Forbidden - Insufficient permissions
      if (status === 403) {
        return Promise.reject({
          status: 403,
          message: data?.message || 'You do not have permission to perform this action.',
          code: 'FORBIDDEN',
        });
      }

      // 404 Not Found
      if (status === 404) {
        return Promise.reject({
          status: 404,
          message: data?.message || 'Resource not found.',
          code: 'NOT_FOUND',
        });
      }

      // 422 Validation Error
      if (status === 422 || status === 400) {
        return Promise.reject({
          status,
          message: data?.message || data?.error || 'Validation failed.',
          code: 'VALIDATION_ERROR',
          details: data?.details || null,
        });
      }

      // 500+ Server Error
      if (status >= 500) {
        console.error('[Axios] Server error response:', JSON.stringify(data));
        return Promise.reject({
          status,
          message: data?.error?.message || data?.message || 'Server error. Please try again later.',
          code: 'SERVER_ERROR',
          serverError: data,
        });
      }

      // Other errors
      return Promise.reject({
        status,
        message: data?.message || data?.error || 'An error occurred.',
        code: data?.code || 'API_ERROR',
        details: data?.details || null,
      });
    }

    // Handle request errors (no response received)
    if (request) {
      // Network error or timeout
      if (error.code === 'ECONNABORTED' || message.includes('timeout')) {
        return Promise.reject({
          status: 0,
          message: 'Request timed out. Please check your connection and try again.',
          code: 'TIMEOUT',
        });
      }

      return Promise.reject({
        status: 0,
        message: 'Network error. Please check your internet connection.',
        code: 'NETWORK_ERROR',
      });
    }

    // Something else went wrong
    return Promise.reject({
      status: 0,
      message: message || 'An unexpected error occurred.',
      code: 'UNKNOWN_ERROR',
    });
  }
);

// ============================================================================
// AUTH HELPER FUNCTIONS
// ============================================================================

/**
 * Set authentication token
 * @param {string} token - JWT token
 */
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
};

/**
 * Get current auth token
 * @returns {string|null} Current token or null
 */
export const getAuthToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Set user data in storage
 * @param {object} user - User data
 */
export const setUserData = (user) => {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
};

/**
 * Get user data from storage
 * @returns {object|null} User data or null
 */
export const getUserData = () => {
  const data = localStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
};

/**
 * Clear all auth data
 */
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export const isAuthenticated = () => {
  return !!localStorage.getItem(TOKEN_KEY);
};

export default api;
