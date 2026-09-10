const TOKEN_KEY = 'queuing_access_token';
const REFRESH_KEY = 'queuing_refresh_token';

export function setTokens(accessToken, refreshToken) {
  try {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  } catch (_) {}
}

export function getAccessToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
}

export function getRefreshToken() {
  try { return localStorage.getItem(REFRESH_KEY) || ''; } catch (_) { return ''; }
}

export function clearTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch (_) {}
}

export function authHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
