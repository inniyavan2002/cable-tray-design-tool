import { useId, useState, type ReactNode } from 'react';
import { plain } from '../../domain/format';
import styles from './controls.module.css';
import { InfoTip } from './InfoTip';

/** A field's label, followed by its plain-words explanation (an InfoTip) when there is one. */
function LabelRow({ topic, info, children }: { topic: string; info?: ReactNode; children: ReactNode }) {
  if (!info) return children;
  return (
    <div className={styles.labelRow}>
      {children}
      <InfoTip topic={topic}>{info}</InfoTip>
    </div>
  );
}

export function TextField(props: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number; info?: ReactNode }) {
  const id = useId();
  return (
    <div className={styles.field}>
      <LabelRow topic={props.label} info={props.info}>
        <label htmlFor={id} className={styles.label}>
          {props.label}
        </label>
      </LabelRow>
      <input
        id={id}
        className={styles.input}
        value={props.value}
        placeholder={props.placeholder}
        maxLength={props.maxLength ?? 80}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  /** Values below this are rejected even if min allows 0 (e.g. max fill must be above 0). */
  exclusiveMin?: boolean;
  onCommit: (value: number) => void;
  /** Explains the setting in plain words. */
  info?: ReactNode;
}

/**
 * A number input that only passes on valid values. While the text is not a
 * valid number the last valid value stays in effect and a message says why;
 * leaving the field restores the last valid value.
 */
export function NumberField({ label, value, unit, min, max, exclusiveMin, onCommit, info }: NumberFieldProps) {
  const id = useId();
  const errorId = useId();
  const [text, setText] = useState(plain(value).replace(/,/g, ''));
  const [error, setError] = useState<string | null>(null);
  const [seenValue, setSeenValue] = useState(value);

  // Follow outside changes (another tray selected), but keep the user's text
  // when it already means the new value (e.g. "40." while typing "40.5").
  if (value !== seenValue) {
    setSeenValue(value);
    if (Number(text.replace(',', '.')) !== value) setText(plain(value).replace(/,/g, ''));
    setError(null);
  }

  const validate = (raw: string): string | null => {
    const n = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || !Number.isFinite(n)) return 'Enter a number.';
    if (exclusiveMin ? n <= min : n < min) return exclusiveMin ? `Must be more than ${min}.` : `Must be at least ${min}.`;
    if (n > max) return `Must be at most ${max}.`;
    return null;
  };

  return (
    <div className={styles.field}>
      <LabelRow topic={label} info={info}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      </LabelRow>
      <div className={styles.numberWrap} data-invalid={error ? 'true' : undefined}>
        <input
          id={id}
          className={styles.numberInput}
          inputMode="decimal"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const problem = validate(e.target.value);
            setError(problem);
            if (!problem) onCommit(Number(e.target.value.replace(',', '.')));
          }}
          onBlur={() => {
            if (error) {
              setText(plain(value).replace(/,/g, ''));
              setError(null);
            }
          }}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function SegmentedControl<T extends string | number>(props: {
  legend: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  info?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset className={styles.segmented}>
      {/* The legend names the group. With an explanation, the visible label moves to a row that can hold the "i". */}
      <legend className={props.info ? 'sr-only' : styles.label}>{props.legend}</legend>
      {props.info && (
        <div className={styles.labelRow}>
          <span className={styles.label} aria-hidden="true">
            {props.legend}
          </span>
          <InfoTip topic={props.legend}>{props.info}</InfoTip>
        </div>
      )}
      <div className={styles.segments}>
        {props.options.map((option) => (
          <label key={String(option.value)} className={styles.segment}>
            <input
              type="radio"
              className={styles.segmentInput}
              name={name}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
            />
            <span className={styles.segmentLabel}>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Switch(props: { label: string; checked: boolean; onChange: (checked: boolean) => void; info?: ReactNode }) {
  const id = useId();
  return (
    <div className={styles.switchRow}>
      <span className={styles.switchLabel}>
        <span id={id}>{props.label}</span>
        {props.info && <InfoTip topic={props.label}>{props.info}</InfoTip>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-labelledby={id}
        className={styles.switch}
        onClick={() => props.onChange(!props.checked)}
      />
    </div>
  );
}

export function QuantityStepper(props: { value: number; onChange: (value: number) => void; label: string; min?: number; max?: number }) {
  const min = props.min ?? 1;
  const max = props.max ?? 999;
  const [text, setText] = useState(String(props.value));
  const [seenValue, setSeenValue] = useState(props.value);
  if (props.value !== seenValue) {
    setSeenValue(props.value);
    setText(String(props.value));
  }
  return (
    <span className={styles.stepper} role="group" aria-label={props.label}>
      <button type="button" className={styles.stepButton} aria-label="One fewer" disabled={props.value <= min} onClick={() => props.onChange(props.value - 1)}>
        −
      </button>
      <input
        className={styles.stepInput}
        inputMode="numeric"
        aria-label="Quantity"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= min && n <= max) props.onChange(n);
        }}
        onBlur={() => setText(String(props.value))}
      />
      <button type="button" className={styles.stepButton} aria-label="One more" disabled={props.value >= max} onClick={() => props.onChange(props.value + 1)}>
        +
      </button>
    </span>
  );
}

export type Tone = 'pass' | 'warn' | 'fail' | 'neutral';

export function Chip(props: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={styles.chip} data-tone={props.tone} title={props.title}>
      {props.children}
    </span>
  );
}
