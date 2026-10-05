import type { ThemePreference } from '../../state/theme';
import { useUiStore } from '../../state/uiStore';
import styles from './ThemeSwitch.module.css';

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function ThemeSwitch() {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  return (
    <fieldset className={styles.switch}>
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} className={styles.option}>
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={theme === option.value}
            onChange={() => setTheme(option.value)}
            className={styles.input}
          />
          <span className={styles.label}>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
