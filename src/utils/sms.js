// src/utils/sms.js

export function buildSmsHref(phoneE164, body) {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const sep = isIOS ? '&' : '?';
  return `sms:${phoneE164}${sep}body=${encodeURIComponent(body)}`;
}

export function hoursUntil(startDateTime) {
  const ms = startDateTime.getTime() - Date.now();
  return ms / (1000 * 60 * 60);
}
