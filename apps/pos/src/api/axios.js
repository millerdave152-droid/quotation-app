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
// TOKEN REFRESH LOGIC
// Prevents 401 logout during active operations (e.g., checkout)
// ============================================================================

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(newToken) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

function onTokenRefreshFailed() {
  refreshSubscribers = [];
}

const REFRESH_TOKEN_KEY = 'pos_refresh_token';

// ============================================================================
// RESPONSE INTERCEPTOR
// Handle 401 with automatic token refresh, handle network errors
// ============================================================================

api.interceptors.response.use(
  (response) => {
    // Return response data directly for cleaner usage
    return response.data;
  },
  async (error) => {
    const { response, request, message, config: originalRequest } = error;

    // Handle response errors (server responded with error status)
    if (response) {
      const { status, data } = response;

      // 401 Unauthorized - Attempt token refresh before giving up
      if (status === 401 && !originalRequest._retry) {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

        if (refreshToken) {
          if (isRefreshing) {
            // Another request is already refreshing — queue this one
            return new Promise((resolve, reject) => {
              subscribeTokenRefresh((newToken) => {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                originalRequest._retry = true;
                resolve(axios(originalRequest).then(r => r.data));
              });
            });
          }

          isRefreshing = true;
          originalRequest._retry = true;

          try {
            // Call refresh endpoint directly (bypass interceptors)
            const refreshResponse = await axios.post(
              `${api.defaults.baseURL}/auth/refresh`,
              { refreshToken },
              { headers: { 'Content-Type': 'application/json' } }
            );

            const result = refreshResponse.data;
            if (result?.success && result.data?.accessToken) {
              const newToken = result.data.accessToken;
              localStorage.setItem(TOKEN_KEY, newToken);
              if (result.data.refreshToken) {
                localStorage.setItem(REFRESH_TOKEN_KEY, result.data.refreshToken);
              }

              console.log('[API] Token refreshed successfully');
              onTokenRefreshed(newToken);
              isRefreshing = false;

              // Notify AuthContext to refresh permissions with the new token
              window.dispatchEvent(new CustomEvent('pos:token-refreshed'));

              // Retry the original request with new token
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return axios(originalRequest).then(r => r.data);
            }
          } catch (refreshError) {
            console.warn('[API] Token refresh failed:', refreshError?.message);
            onTokenRefreshFailed();
          }

          isRefreshing = false;
        }

        // Refresh failed or no refresh token — clear auth and notify
        console.warn('[API] Unauthorized - session expired');
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);

        // Dispatch event so AuthContext can redirect gracefully.
        // This lets active try/catch blocks (e.g., checkout) handle the error first.
        window.dispatchEvent(new CustomEvent('pos:auth-expired'));

        return Promise.reject({
          status: 401,
          message: data?.message || 'Session expired. Please log in again.',
          code: 'UNAUTHORIZED',
        });
      }

      // 403 Forbidden - Attempt permission refresh before failing.
      // This handles stale tokens where the user's role/permissions changed
      // since the token was issued.
      if (status === 403 && !originalRequest._retried403) {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshToken && !isRefreshing) {
          originalRequest._retried403 = true;
          try {
            const refreshResponse = await axios.post(
              `${api.defaults.baseURL}/auth/refresh`,
              { refreshToken },
              { headers: { 'Content-Type': 'application/json' } }
            );
            const result = refreshResponse.data;
            if (result?.success && result.data?.accessToken) {
              const newToken = result.data.accessToken;
              localStorage.setItem(TOKEN_KEY, newToken);
              if (result.data.refreshToken) {
                localStorage.setItem(REFRESH_TOKEN_KEY, result.data.refreshToken);
              }
              window.dispatchEvent(new CustomEvent('pos:token-refreshed'));
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return axios(originalRequest).then(r => r.data);
            }
          } catch (refreshErr) {
            // Refresh failed — fall through to 403 rejection
          }
        }

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
          message: data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : 'Validation failed.'),
          code: data?.error?.code || 'VALIDATION_ERROR',
          details: data?.error?.details || data?.details || null,
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
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export const isAuthenticated = () => {
  return !!localStorage.getItem(TOKEN_KEY);
};

// ============================================================================
// REQUEST UTILITIES
// ============================================================================

/**
 * Create a cancellable request
 * @param {string} method - HTTP method (get, post, put, patch, delete)
 * @param {string} url - API endpoint
 * @param {object} data - Request body (for POST/PUT/PATCH)
 * @param {object} config - Additional axios config
 * @returns {{ promise: Promise, cancel: Function }} Request promise and cancel function
 */
export const createCancellableRequest = (method, url, data = null, config = {}) => {
  const controller = new AbortController();

  const requestConfig = {
    ...config,
    signal: controller.signal,
  };

  let promise;
  switch (method.toLowerCase()) {
    case 'get':
      promise = api.get(url, requestConfig);
      break;
    case 'post':
      promise = api.post(url, data, requestConfig);
      break;
    case 'put':
      promise = api.put(url, data, requestConfig);
      break;
    case 'patch':
      promise = api.patch(url, data, requestConfig);
      break;
    case 'delete':
      promise = api.delete(url, requestConfig);
      break;
    default:
      throw new Error(`Unsupported HTTP method: ${method}`);
  }

  return {
    promise,
    cancel: () => controller.abort(),
  };
};

/**
 * Make a request with retry logic for transient failures
 * @param {string} method - HTTP method
 * @param {string} url - API endpoint
 * @param {object} data - Request body (for POST/PUT/PATCH)
 * @param {object} options - Options including retries and retryDelay
 * @returns {Promise} API response
 */
export const requestWithRetry = async (method, url, data = null, options = {}) => {
  const { retries = 3, retryDelay = 1000, ...config } = options;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      switch (method.toLowerCase()) {
        case 'get':
          return await api.get(url, config);
        case 'post':
          return await api.post(url, data, config);
        case 'put':
          return await api.put(url, data, config);
        case 'patch':
          return await api.patch(url, data, config);
        case 'delete':
          return await api.delete(url, config);
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }
    } catch (error) {
      lastError = error;

      // Don't retry on 4xx errors (except 408 timeout and 429 rate limit)
      const status = error.status || error.response?.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        throw error;
      }

      // Don't retry on cancelled requests
      if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
        throw error;
      }

      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`[API] Retry ${attempt + 1}/${retries} for ${url} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

export default api;
