const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const normalizeHeaders = (headers) => {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  if (typeof headers === 'object') {
    return { ...headers };
  }
  return {};
};

const hasHeader = (headers, headerName) => {
  const target = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
};

const getAuthToken = () => {
  try {
    return localStorage.getItem('auth_token');
  } catch {
    return null;
  }
};

export const buildAuthHeaders = (baseHeaders = {}, options = {}) => {
  const headers = normalizeHeaders(baseHeaders);
  const isFormData = options.isFormData === true
    || (typeof FormData !== 'undefined' && options.body instanceof FormData);
  const includeJsonContentType = options.includeJsonContentType !== false;

  if (includeJsonContentType && !isFormData && !hasHeader(headers, 'Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }

  if (!hasHeader(headers, 'Authorization')) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
};

export const authFetch = (url, options = {}) => {
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
  const { headers, skipAuth, includeJsonContentType, ...rest } = options;

  const nextHeaders = skipAuth
    ? normalizeHeaders(headers)
    : buildAuthHeaders(headers, {
      includeJsonContentType,
      body: rest.body
    });

  return fetch(fullUrl, {
    ...rest,
    headers: nextHeaders
  });
};

export default authFetch;
