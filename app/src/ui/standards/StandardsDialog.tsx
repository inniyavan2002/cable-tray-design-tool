import { useId, useState } from 'react';
import { DEFAULT_STANDARDS, DEFAULT_TRAY_SETTINGS } from '../../domain/normalize';
import { int, plain } from '../../domain/format';
import type { TraySettings } from '../../domain/types';
import { DEFAULT_CLEARANCE_OPTIONS } from '../../state/projectModel';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { NumberField, SegmentedControl, Switch } from '../common/controls';
import { Dialog } from '../common/Dialog';
import { LAYERS, SPACING, TRAY_TYPES } from '../settings/TraySettingsCard';
import styles from './StandardsDialog.module.css';

export function StandardsDialog() {
  const open = useUiStore((s) => s.dialog === 'standards');
  const openDialog = useUiStore((s) => s.openDialog);
  const close = () => openDialog(null);
  return (
    <Dialog open={open} title="Standards and settings" onClose={close} size="wide">
      {open && <StandardsForm onClose={close} />}
    </Dialog>
  );
}

interface ParsedList {
  values: number[];
  error: string | null;
}

/** Reads "50, 75, 100" into sorted, distinct numbers, or says what is wrong. */
export function parseSizeList(text: string, max: number): ParsedList {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const bad = tokens.filter((t) => {
    const n = Number(t);
    return !Number.isFinite(n) || n <= 0 || n > max;
  });
  if (bad.length) return { values: [], error: `Not a size between 0 and ${int(max)}: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ' …' : ''}` };
  const values = [...new Set(tokens.map(Number))].sort((a, b) => a - b);
  return values.length ? { values, error: null } : { values, error: 'Enter at least one value.' };
}

const listText = (values: readonly number[]) => values.map((v) => plain(v).replace(/,/g, '')).join(', ');

function ListField({ label, hint, text, parsed, unit, onChange }: { label: string; hint: string; text: string; parsed: ParsedList; unit: string; onChange: (text: string) => void }) {
  const id = useId();
  const noteId = useId();
  return (
    <div className={styles.listField}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.listInput}
        value={text}
        aria-invalid={parsed.error ? true : undefined}
        aria-describedby={noteId}
        onChange={(e) => onChange(e.target.value)}
      />
      <span id={noteId} className={parsed.error ? styles.error : styles.note}>
        {parsed.error ?? `${parsed.values.length} value${parsed.values.length === 1 ? '' : 's'}, ${plain(parsed.values[0]!)}–${plain(parsed.values.at(-1)!)} ${unit}. ${hint}`}
      </span>
    </div>
  );
}

function StandardsForm({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const updateSetup = useProjectStore((s) => s.updateSetup);
  const showNotice = useProjectStore((s) => s.showNotice);
  const [widths, setWidths] = useState(listText(project.standards.widthsMm));
  const [heights, setHeights] = useState(listText(project.standards.heightsMm));
  const [clearance, setClearance] = useState(listText(project.clearanceOptions));
  const [defaults, setDefaults] = useState<TraySettings>(project.trayDefaults);
  const [applyToTrays, setApplyToTrays] = useState(false);
  const w = parseSizeList(widths, 5000);
  const h = parseSizeList(heights, 2000);
  const c = parseSizeList(clearance, 5);
  const valid = !w.error && !h.error && !c.error;
  const setDefault = (patch: Partial<TraySettings>) => setDefaults((d) => ({ ...d, ...patch }));
  const clearanceValues = [...new Set([...c.values, defaults.clearanceFactor])].sort((a, b) => a - b);
  const trays = project.trays.length;

  const save = () => {
    if (!valid) return;
    updateSetup({ standards: { widthsMm: w.values, heightsMm: h.values }, clearanceOptions: c.values, trayDefaults: defaults }, applyToTrays);
    if (applyToTrays) {
      showNotice({ tone: 'info', text: `Applied the tray defaults to all ${trays} tray${trays === 1 ? '' : 's'}.`, after: useProjectStore.getState().project });
    }
    onClose();
  };

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className={styles.intro}>These settings belong to this project and are saved in its project file, so colleagues who open it get the same sizes.</p>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Standard tray sizes</legend>
        <ListField label="Widths (mm)" hint="The tray is chosen from these." unit="mm" text={widths} parsed={w} onChange={setWidths} />
        <ListField label="Heights (mm)" hint="Every width is combined with every height." unit="mm" text={heights} parsed={h} onChange={setHeights} />
        <ListField
          label="Side clearance options (× largest OD)"
          hint="Offered in each tray’s settings."
          unit="×"
          text={clearance}
          parsed={c}
          onChange={setClearance}
        />
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Defaults for new trays</legend>
        <div className={styles.defaults}>
          <SegmentedControl legend="Tray type" options={TRAY_TYPES} value={defaults.trayType} onChange={(trayType) => setDefault({ trayType })} />
          <SegmentedControl legend="Layers" options={LAYERS} value={defaults.layers} onChange={(layers) => setDefault({ layers })} />
          <SegmentedControl legend="Spacing between cables" options={SPACING} value={defaults.spacing} onChange={(spacing) => setDefault({ spacing })} />
          <Switch label="Gap between layers" checked={defaults.layerGap} onChange={(layerGap) => setDefault({ layerGap })} />
          <SegmentedControl
            legend="Side clearance, each rail (× largest OD)"
            options={clearanceValues.map((v) => ({ value: v, label: `${plain(v)}×` }))}
            value={defaults.clearanceFactor}
            onChange={(clearanceFactor) => setDefault({ clearanceFactor })}
          />
          <div className={styles.numbers}>
            <NumberField label="Top clearance" unit="%" min={0} max={200} value={defaults.topClearancePct} onCommit={(topClearancePct) => setDefault({ topClearancePct })} />
            <NumberField label="Spare (width)" unit="%" min={0} max={200} value={defaults.sparePct} onCommit={(sparePct) => setDefault({ sparePct })} />
            <NumberField label="Max fill" unit="%" min={0} exclusiveMin max={100} value={defaults.maxFillPct} onCommit={(maxFillPct) => setDefault({ maxFillPct })} />
          </div>
          <FillMethodField />
        </div>
        <label className={styles.apply}>
          <input type="checkbox" checked={applyToTrays} onChange={(e) => setApplyToTrays(e.target.checked)} />
          Also give all {trays} existing tray{trays === 1 ? '' : 's'} these settings
        </label>
      </fieldset>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            setWidths(listText(DEFAULT_STANDARDS.widthsMm));
            setHeights(listText(DEFAULT_STANDARDS.heightsMm));
            setClearance(listText(DEFAULT_CLEARANCE_OPTIONS));
            setDefaults({ ...DEFAULT_TRAY_SETTINGS });
          }}
        >
          Reset to built-in values
        </button>
        <span className={styles.spacer} />
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className={styles.primary} disabled={!valid}>
          Save
        </button>
      </div>
    </form>
  );
}

/** Only the area method exists; NEC 392.22 is listed as planned (see the frontend plan). */
function FillMethodField() {
  const id = useId();
  return (
    <div className={styles.method}>
      <label htmlFor={id} className={styles.label}>
        Fill calculation method
      </label>
      <select id={id} className={styles.select} value="standard-area" onChange={() => undefined}>
        <option value="standard-area">Area method: cable area ÷ tray width × height</option>
        <option value="nec" disabled>
          NEC 392.22 (planned)
        </option>
      </select>
    </div>
  );
}
