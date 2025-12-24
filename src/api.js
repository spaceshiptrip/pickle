import { APP_SCRIPT_URL } from './config';

export async function apiGet(params) {
  const url = new URL(APP_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error('API error');
  return res.json();
}

export async function apiPost(action, body) {
  // Google Apps Script doesn't support CORS preflight (OPTIONS) for application/json.
  // We must send as text/plain to skip the preflight.
  const res = await fetch(`${APP_SCRIPT_URL}?action=${action}`, {
    method: 'POST',
    body: JSON.stringify(body),
    // fetch defaults to text/plain if no header, which is what we want.
    // Explicitly removing custom Content-Type header to avoid preflight.
  });
  if (!res.ok) throw new Error('API error');
  return res.json();
}
