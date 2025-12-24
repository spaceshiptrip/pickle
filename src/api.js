import { APP_SCRIPT_URL } from './config';

export async function apiGet(params) {
  const url = new URL(APP_SCRIPT_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error('API error');
  return res.json();
}

export async function apiPost(action, body) {
  const res = await fetch(`${APP_SCRIPT_URL}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('API error');
  return res.json();
}
