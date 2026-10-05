import { plain } from '../../domain/format';
import type { LayerCount, SpacingFactor, TrayType } from '../../domain/types';
import type { Tray } from '../../state/projectModel';
import { useProjectStore } from '../../state/projectStore';
import { NumberField, SegmentedControl, Switch, TextField } from '../common/controls';
import { Panel } from '../common/Panel';
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

export function TraySettingsCard({ tray }: { tray: Tray }) {
  const updateTray = useProjectStore((s) => s.updateTray);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const clearanceOptions = useProjectStore((s) => s.project.clearanceOptions);
  const s = tray.settings;
  const set = (patch: Parameters<typeof updateSettings>[1]) => updateSettings(tray.id, patch);
  const clearanceValues = [...new Set([...clearanceOptions, s.clearanceFactor])].sort((a, b) => a - b);

  return (
    <Panel title="Tray settings">
      <div className={styles.stack}>
        <div className={styles.grid2}>
          <TextField label="Tray ID" value={tray.name} maxLength={30} onChange={(name) => updateTray(tray.id, { name })} />
          <TextField label="Service" value={tray.service} placeholder="e.g. LV power" onChange={(service) => updateTray(tray.id, { service })} />
        </div>
        <SegmentedControl legend="Tray type" options={TRAY_TYPES} value={s.trayType} onChange={(trayType) => set({ trayType })} />

        <section className={styles.group} aria-label="Arrangement">
          <h4 className={styles.groupTitle}>Arrangement</h4>
          <SegmentedControl legend="Layers" options={LAYERS} value={s.layers} onChange={(layers) => set({ layers })} />
          <SegmentedControl legend="Spacing between cables" options={SPACING} value={s.spacing} onChange={(spacing) => set({ spacing })} />
          <Switch label="Gap between layers" checked={s.layerGap} onChange={(layerGap) => set({ layerGap })} />
          {s.layers === 1 && <p className={styles.hint}>The layer gap only matters with 2 or 3 layers.</p>}
        </section>

        <section className={styles.group} aria-label="Allowances">
          <h4 className={styles.groupTitle}>Allowances</h4>
          <SegmentedControl
            legend="Side clearance, each rail (× largest OD)"
            options={clearanceValues.map((v) => ({ value: v, label: `${plain(v)}×` }))}
            value={s.clearanceFactor}
            onChange={(clearanceFactor) => set({ clearanceFactor })}
          />
          <div className={styles.grid3}>
            <NumberField label="Top clearance" unit="%" min={0} max={200} value={s.topClearancePct} onCommit={(topClearancePct) => set({ topClearancePct })} />
            <NumberField label="Spare (width)" unit="%" min={0} max={200} value={s.sparePct} onCommit={(sparePct) => set({ sparePct })} />
            <NumberField label="Max fill" unit="%" min={0} exclusiveMin max={100} value={s.maxFillPct} onCommit={(maxFillPct) => set({ maxFillPct })} />
          </div>
          <p className={styles.hint}>Top clearance is a percentage of the largest cable OD. Spare capacity adds to the width only.</p>
        </section>
      </div>
    </Panel>
  );
}
