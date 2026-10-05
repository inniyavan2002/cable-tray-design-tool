import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, applyThemePreference, readThemePreference, writeThemePreference } from './theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('readThemePreference', () => {
  it('returns a saved light or dark choice', () => {
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'light' }))).toBe('light');
  });

  it('falls back to system for missing or unknown values', () => {
    expect(readThemePreference(memoryStorage())).toBe('system');
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'purple' }))).toBe('system');
  });

  it('falls back to system when storage throws or is unavailable', () => {
    expect(readThemePreference(throwingStorage)).toBe('system');
    expect(readThemePreference(undefined)).toBe('system');
  });
});

describe('writeThemePreference', () => {
  it('stores light/dark and clears the key for system', () => {
    const storage = memoryStorage();
    writeThemePreference('dark', storage);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('dark');
    writeThemePreference('system', storage);
    expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it('does not throw when storage is blocked', () => {
    expect(() => writeThemePreference('light', throwingStorage)).not.toThrow();
  });
});

describe('applyThemePreference', () => {
  it('sets data-theme for an explicit choice and removes it for system', () => {
    const root = document.createElement('html');
    applyThemePreference('dark', root);
    expect(root.getAttribute('data-theme')).toBe('dark');
    applyThemePreference('system', root);
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
