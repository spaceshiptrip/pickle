const KEY = 'post_login_redirect';

export function setPostLoginRedirect(path) {
  localStorage.setItem(KEY, path);
}

export function popPostLoginRedirect() {
  const v = localStorage.getItem(KEY);
  if (v) localStorage.removeItem(KEY);
  return v;
}

