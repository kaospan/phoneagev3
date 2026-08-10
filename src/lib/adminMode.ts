export const ADMIN_MODE_UPDATED_EVENT = 'admin-mode-updated';
const ADMIN_MODE_KEY = 'stone-age-admin-mode';

export const getAdminMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return (localStorage.getItem(ADMIN_MODE_KEY) ?? '0') === '1';
  } catch {
    return false;
  }
};

export const setAdminMode = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ADMIN_MODE_KEY, enabled ? '1' : '0');
    window.dispatchEvent(new Event(ADMIN_MODE_UPDATED_EVENT));
  } catch {
    // ignore storage failures
  }
};
