const TOKEN_KEY = 'shopease_token';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL || ''
).replace(/\/$/, '');

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable
  }
}

export async function api(path, options = {}) {
  const token = getToken();
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event('shopease:unauthorized'));
    }
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}
