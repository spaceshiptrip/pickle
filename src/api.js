import { APP_SCRIPT_URL } from './config';

const getSessionId = () => localStorage.getItem('pickle_session_id');

export async function apiGet(params) {
  const url = new URL(APP_SCRIPT_URL);

  const sessionId = getSessionId();
  if (sessionId) url.searchParams.set('sessionId', sessionId);

  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error('API error');
  return res.json();
}

export async function apiPost(action, body) {
  const sessionId = getSessionId();
  const res = await fetch(`${APP_SCRIPT_URL}?action=${action}`, {
    method: 'POST',
    body: JSON.stringify({
      ...body,
      sessionId // Automatically include session if we have one
    }),
  });
  if (!res.ok) throw new Error('API error');
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error || 'Request failed');
  return data;
}

/** Auth Endpoints */
export const authApi = {
  loginWithPin: (phone, pin) => apiPost('auth.loginwithpin', { phone, pin }),
  requestMagicLink: (email, name) => apiPost('auth.requestmagiclink', { email, name }),
  consumeToken: (token) => apiPost('auth.consumetoken', { token }),
  logout: (sessionId) => apiPost('auth.logout', { sessionId }),
  whoAmI: (sessionId) => apiPost('auth.whoami', { sessionId }),
};
