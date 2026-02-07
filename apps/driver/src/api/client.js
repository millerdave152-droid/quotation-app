const BASE_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'driver_token';

async function request(method, path, body) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return { data, status: res.status };
}

export default {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),

  async upload(path, formData) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return { data, status: res.status };
  },
};
