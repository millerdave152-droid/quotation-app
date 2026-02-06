import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const AUTH_ENDPOINT_REGEX = /\/api\/auth\/(login|register|refresh)/i;

const getAuthToken = () => {
  try {
    return localStorage.getItem('auth_token');
  } catch {
    return null;
  }
};

const hasAuthHeader = (headers) => {
  if (!headers) return false;
  if (headers instanceof Headers) {
    return headers.has('Authorization') || headers.has('authorization');
  }
  if (Array.isArray(headers)) {
    return headers.some(([key]) => String(key).toLowerCase() === 'authorization');
  }
  if (typeof headers === 'object') {
    if (Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) {
      return true;
    }
    if (headers.common && typeof headers.common === 'object') {
      return Object.keys(headers.common).some((key) => key.toLowerCase() === 'authorization');
    }
  }
  return false;
};

const isApiUrl = (url) => {
  if (!url) return false;
  if (url.startsWith(API_URL)) return true;
  return url.includes('/api/');
};

const shouldDispatchAuthExpired = (url, headers) => {
  const token = getAuthToken();
  if (!token) return false;
  if (typeof window !== 'undefined' && window.__authExpired) return false;
  if (!isApiUrl(url)) return false;
  if (AUTH_ENDPOINT_REGEX.test(url)) return false;
  if (!hasAuthHeader(headers)) return false;
  return true;
};

const installAuthGuards = () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.__authGuardInstalled) {
    return;
  }

  window.__authGuardInstalled = true;

  const dispatchAuthExpired = (url) => {
    window.__authExpired = true;
    try {
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: { url } }));
    } catch {
      // Ignore event dispatch errors
    }
  };

  if (typeof window.fetch === 'function' && !window.__authFetchWrapped) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const requestUrl = typeof input === 'string' ? input : input?.url;
      const requestHeaders = init?.headers || input?.headers;
      if (response && response.status === 401 && shouldDispatchAuthExpired(requestUrl || response.url || '', requestHeaders)) {
        dispatchAuthExpired(response.url || requestUrl || '');
      }
      return response;
    };
    window.__authFetchWrapped = true;
  }

  if (!axios.__authInterceptorInstalled) {
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) {
          const requestUrl = error?.config?.url || '';
          const requestHeaders = error?.config?.headers;
          if (shouldDispatchAuthExpired(requestUrl, requestHeaders)) {
            dispatchAuthExpired(requestUrl);
          }
        }
        return Promise.reject(error);
      }
    );
    axios.__authInterceptorInstalled = true;
  }
};

installAuthGuards();
