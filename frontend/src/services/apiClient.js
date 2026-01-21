/**
 * API Client with JWT Token Refresh
 *
 * Centralized axios instance with automatic token refresh on 401 errors.
 * Handles concurrent 401s with a request queue to prevent multiple refresh calls.
 */

import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Track refresh state to prevent multiple refresh calls
let isRefreshing = false;
let failedQueue = [];

/**
 * Process queued requests after token refresh
 * @param {Error|null} error - Error if refresh failed
 * @param {string|null} token - New token if refresh succeeded
 */
const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Refresh the access token using the refresh token
 * @returns {Promise<string>} New access token
 */
const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('auth_refresh_token');

  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await axios.post(`${API_URL}/api/auth/refresh`, {
    refreshToken
  });

  if (response.data.success && response.data.data?.accessToken) {
    const { accessToken, refreshToken: newRefreshToken } = response.data.data;

    // Store new tokens
    localStorage.setItem('auth_token', accessToken);
    if (newRefreshToken) {
      localStorage.setItem('auth_refresh_token', newRefreshToken);
    }

    return accessToken;
  }

  throw new Error('Token refresh failed');
};

/**
 * Trigger logout - clears tokens and optionally redirects
 */
const triggerLogout = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_refresh_token');
  localStorage.removeItem('auth_user');

  // Dispatch custom event for AuthContext to handle
  window.dispatchEvent(new CustomEvent('auth:logout'));
};

// Request interceptor - Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle 401 errors with token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is not 401 or request already retried, reject
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't try to refresh on auth endpoints
    if (originalRequest.url?.includes('/api/auth/')) {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const newToken = await refreshAccessToken();

      // Process queued requests with new token
      processQueue(null, newToken);

      // Retry original request with new token
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Process queued requests with error
      processQueue(refreshError, null);

      // Trigger logout on refresh failure
      triggerLogout();

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;

/**
 * Helper function to make authenticated API calls
 * @param {string} method - HTTP method
 * @param {string} url - API endpoint
 * @param {object} data - Request body (for POST/PUT/PATCH)
 * @param {object} config - Additional axios config
 * @returns {Promise} API response
 */
export const api = {
  get: (url, config = {}) => apiClient.get(url, config),
  post: (url, data, config = {}) => apiClient.post(url, data, config),
  put: (url, data, config = {}) => apiClient.put(url, data, config),
  patch: (url, data, config = {}) => apiClient.patch(url, data, config),
  delete: (url, config = {}) => apiClient.delete(url, config)
};
