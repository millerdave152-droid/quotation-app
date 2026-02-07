/**
 * API Client with JWT Token Refresh
 *
 * Centralized axios instance with automatic token refresh on 401 errors.
 * Handles concurrent 401s with a request queue to prevent multiple refresh calls.
 *
 * Features:
 * - Automatic token refresh on 401 errors
 * - Request queue for concurrent 401s
 * - Configurable timeout (default: 30 seconds)
 * - Detailed error handling with status codes
 * - Network error detection
 */

import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

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

const applyAuthInterceptors = (client) => {
  // Request interceptor - Add auth token to requests
  client.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor - Handle errors including 401 with token refresh
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
    const originalRequest = error.config;

    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      const timeoutError = new Error(`Request timeout after ${originalRequest?.timeout || DEFAULT_TIMEOUT}ms`);
      timeoutError.code = 'TIMEOUT';
      timeoutError.originalError = error;
      return Promise.reject(timeoutError);
    }

    // Handle network errors
    if (!error.response && error.message === 'Network Error') {
      const networkError = new Error('Network error: Unable to connect to server. Please check your internet connection.');
      networkError.code = 'NETWORK_ERROR';
      networkError.originalError = error;
      return Promise.reject(networkError);
    }

    // If error is not 401 or request already retried, reject with enhanced error
    if (error.response?.status !== 401 || originalRequest._retry) {
      // Enhance error with response details
      if (error.response) {
        const enhancedError = new Error(
          error.response.data?.error ||
          error.response.data?.message ||
          error.message ||
          `Request failed with status ${error.response.status}`
        );
        enhancedError.status = error.response.status;
        enhancedError.statusText = error.response.statusText;
        enhancedError.data = error.response.data;
        enhancedError.originalError = error;
        return Promise.reject(enhancedError);
      }
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
          return client(originalRequest);
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
      return client(originalRequest);
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
};

const createBaseClient = (config = {}) => {
  const defaultHeaders = { 'Content-Type': 'application/json' };
  const mergedHeaders = { ...defaultHeaders, ...(config.headers || {}) };
  return axios.create({
    baseURL: API_URL,
    timeout: DEFAULT_TIMEOUT,
    ...config,
    headers: mergedHeaders
  });
};

// Create axios instance with timeout
const apiClient = createBaseClient();
applyAuthInterceptors(apiClient);

export default apiClient;
export { applyAuthInterceptors };

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

export const createAuthorizedClient = (config = {}) => {
  const client = createBaseClient(config);
  applyAuthInterceptors(client);
  return client;
};

/**
 * Create a request with AbortController for cancellation
 * @param {string} method - HTTP method
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
      promise = apiClient.get(url, requestConfig);
      break;
    case 'post':
      promise = apiClient.post(url, data, requestConfig);
      break;
    case 'put':
      promise = apiClient.put(url, data, requestConfig);
      break;
    case 'patch':
      promise = apiClient.patch(url, data, requestConfig);
      break;
    case 'delete':
      promise = apiClient.delete(url, requestConfig);
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
          return await apiClient.get(url, config);
        case 'post':
          return await apiClient.post(url, data, config);
        case 'put':
          return await apiClient.put(url, data, config);
        case 'patch':
          return await apiClient.patch(url, data, config);
        case 'delete':
          return await apiClient.delete(url, config);
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }
    } catch (error) {
      lastError = error;

      // Don't retry on 4xx errors (except 408 timeout and 429 rate limit)
      if (error.status && error.status >= 400 && error.status < 500 &&
          error.status !== 408 && error.status !== 429) {
        throw error;
      }

      // Don't retry on cancelled requests
      if (error.code === 'ERR_CANCELED') {
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
