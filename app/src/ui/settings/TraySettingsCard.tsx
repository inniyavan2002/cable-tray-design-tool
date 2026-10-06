import { plain } from '../../domain/format';
import type { LayerCount, SpacingFactor, TrayType } from '../../domain/types';
import type { Tray } from '../../state/projectModel';
import { useProjectStore } from '../../state/projectStore';
import { NumberField, SegmentedControl, Switch, TextField } from '../common/controls';
import { CollapsiblePanel } from '../common/Panel';
import { STEP_TARGETS } from '../shell/steps';
import styles from './TraySettingsCard.module.css';

export const TRAY_TYPES: ReadonlyArray<{ value: TrayType; label: string }> = [
  { value: 'perforated', label: 'Perforated' },
  { value: 'ladder', label: 'Ladder' },
];
export const LAYERS: ReadonlyArray<{ value: LayerCount; label: string }> = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
];
export const SPACING: ReadonlyArray<{ value: SpacingFactor; label: string }> = [
  { value: 0, label: 'Touching' },
  { value: 0.5, label: '0.5d' },
  { value: 1, label: '1d' },
  { value: 2, label: '2d' },
];

function useSettings(tray: Tray) {
  const updateSettings = useProjectStore((s) => s.updateSettings);
  return (patch: Parameters<typeof updateSettings>[1]) => updateSettings(tray.id, patch);
}

/** Step 1: which tray this is. None of these change the size. */
export function TrayCard({ tray }: { tray: Tray }) {
  const updateTray = useProjectStore((s) => s.updateTray);
  const set = useSettings(tray);
  const s = tray.settings;
  const type = TRAY_TYPES.find((t) => t.value === s.trayType)?.label ?? '';
  return (
    <CollapsiblePanel id={STEP_TARGETS.tray} title="Tray" summary={`${tray.name} · ${tray.service || 'no service'} · ${type}`}>
      <div className={styles.stack}>
        <div className={styles.grid2}>
          <TextField
            label="Tray ID"
            value={tray.name}
            maxLength={30}
            onChange={(name) => updateTray(tray.id, { name })}
            info="Names this tray in the tray list, on its drawing and in the reports."
          />
          <TextField
            label="Service"
            value={tray.service}
            placeholder="e.g. LV power"
            onChange={(service) => updateTray(tray.id, { service })}
            info="What the tray carries. Printed with the tray ID on drawings and reports; it does not change the size."
          />
        </div>
        <SegmentedControl
          legend="Tray type"
          options={TRAY_TYPES}
          value={s.trayType}
          onChange={(trayType) => set({ trayType })}
          info="Printed on drawings and reports. It does not change the sizing yet."
        />
      </div>
    </CollapsiblePanel>
  );
}

/** Step 3: how the cables are laid in the tray. */
export function ArrangementCard({ tray }: { tray: Tray }) {
  const set = useSettings(tray);
  const s = tray.settings;
  const spacing = SPACING.find((o) => o.value === s.spacing)?.label ?? `${plain(s.spacing)}d`;
  return (
    <CollapsiblePanel
      id={STEP_TARGETS.arrangement}
      title="Cable arrangement"
      summary={`${s.layers} layer${s.layers === 1 ? '' : 's'} · ${spacing} · layer gap ${s.layerGap ? 'on' : 'off'}`}
    >
      <div className={styles.stack}>
        <SegmentedControl
          legend="Layers"
          options={LAYERS}
          value={s.layers}
          onChange={(layers) => set({ layers })}
          info="How many layers the cables are stacked in. Every layer is used when there are enough cables; more layers make the tray narrower and taller."
        />
        <SegmentedControl
          legend="Spacing between cables"
          options={SPACING}
          value={s.spacing}
          onChange={(spacing) => set({ spacing })}
          info="The gap between neighbouring cables in a layer, as a multiple of the larger cable's OD (d). Touching leaves no gap."
        />
        <Switch
          label="Gap between layers"
          checked={s.layerGap}
          onChange={(layerGap) => set({ layerGap })}
          info="Leaves a gap under each upper layer equal to the largest cable OD in that layer."
        />
        {s.layers === 1 && <p className={styles.hint}>The layer gap only matters with 2 or 3 layers.</p>}
      </div>
    </CollapsiblePanel>
  );
}

/** Step 3, continued: the margins and the fill limit the size must meet. */
export function AllowancesCard({ tray }: { tray: Tray }) {
  const set = useSettings(tray);
  const clearanceOptions = useProjectStore((p) => p.project.clearanceOptions);
  const s = tray.settings;
  const clearanceValues = [...new Set([...clearanceOptions, s.clearanceFactor])].sort((a, b) => a - b);
  return (
    <CollapsiblePanel
      title="Design allowances"
      summary={`clearance ${plain(s.clearanceFactor)}× · top ${plain(s.topClearancePct)}% · spare ${plain(s.sparePct)}% · fill ≤ ${plain(s.maxFillPct)}%`}
    >
      <div className={styles.stack}>
        <SegmentedControl
          legend="Side clearance, each rail (× largest OD)"
          options={clearanceValues.map((v) => ({ value: v, label: `${plain(v)}×` }))}
          value={s.clearanceFactor}
          onChange={(clearanceFactor) => set({ clearanceFactor })}
          info="Free space beside each side rail, as a multiple of the largest cable OD. It is added at both rails."
        />
        <div className={styles.grid3}>
          <NumberField
            label="Top clearance"
            unit="%"
            min={0}
            max={200}
            value={s.topClearancePct}
            onCommit={(topClearancePct) => set({ topClearancePct })}
            info="Free space above the top layer, as a percentage of the largest cable OD. Adds to the height."
          />
          <NumberField
            label="Spare (width)"
            unit="%"
            min={0}
            max={200}
            value={s.sparePct}
            onCommit={(sparePct) => set({ sparePct })}
            info="Room for future cables, as a percentage of the widest layer. Adds to the width only."
          />
          <NumberField
            label="Max fill"
            unit="%"
            min={0}
            exclusiveMin
            max={100}
            value={s.maxFillPct}
            onCommit={(maxFillPct) => set({ maxFillPct })}
            info="The highest fill allowed: total cable cross-section area ÷ tray cross-section (width × height). The smallest standard size within it is chosen."
          />
        </div>
        <p className={styles.hint}>Top clearance is a percentage of the largest cable OD. Spare capacity adds to the width only.</p>
      </div>
    </CollapsiblePanel>
  );
}
