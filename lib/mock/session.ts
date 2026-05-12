const KEY = 'yeseong_mock_session';

export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(KEY) === '1';
}

export function login() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, '1');
}

export function logout() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}
