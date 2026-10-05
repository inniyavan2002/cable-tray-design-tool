export type ThemePreference = 'system' | 'light' | 'dark';

/** Must match the key read by the inline script in index.html. */
export const THEME_STORAGE_KEY = 'ctd.theme';

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Browser storage can be missing or throw (private windows, blocked site data). */
function defaultStorage(): ThemeStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readThemePreference(storage: ThemeStorage | undefined = defaultStorage()): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage: ThemeStorage | undefined = defaultStorage(),
): void {
  try {
    if (preference === 'system') storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The choice still applies for this session; it just won't be remembered.
  }
}

/** "system" removes the attribute so the OS light/dark setting decides. */
export function applyThemePreference(preference: ThemePreference, root: HTMLElement = document.documentElement): void {
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}
