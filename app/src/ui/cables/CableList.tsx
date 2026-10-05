import { useRef, useState } from 'react';
import { useArrivalMotion } from '../common/motion';
import { num1 } from '../../domain/format';
import { MAX_CABLE_ROWS, type Tray } from '../../state/projectModel';
import { useProjectStore } from '../../state/projectStore';
import type { ResolvedCable } from '../../state/trayResult';
import { useUiStore } from '../../state/uiStore';
import { Chip, QuantityStepper } from '../common/controls';
import { Panel } from '../common/Panel';
import { CablePicker } from '../picker/CablePicker';
import styles from './CableList.module.css';

export function CableTag({ tag, colourIndex, small }: { tag: number; colourIndex: number; small?: boolean }) {
  return (
    <span className={styles.tag} data-small={small ? 'true' : undefined} style={{ background: `var(--cab-${colourIndex + 1})` }} aria-hidden="true">
      {tag}
    </span>
  );
}

export function CableList({ tray, resolved }: { tray: Tray; resolved: readonly ResolvedCable[] }) {
  const addCable = useProjectStore((s) => s.addCable);
  const setQuantity = useProjectStore((s) => s.setCableQuantity);
  const removeCable = useProjectStore((s) => s.removeCable);
  const openCatalog = useUiStore((s) => s.openCatalog);
  const [pickerOpen, setPickerOpen] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useArrivalMotion(
    list,
    tray.id,
    tray.cables.map((c) => c.id),
  );
  const total = tray.cables.reduce((sum, c) => sum + c.quantity, 0);
  const full = tray.cables.length >= MAX_CABLE_ROWS;

  return (
    <Panel title="Cables" meta={`${tray.cables.length} row${tray.cables.length === 1 ? '' : 's'} · ${total} cable${total === 1 ? '' : 's'}`}>
      {resolved.length === 0 ? (
        <p className={styles.empty}>No cables yet. Add the cables that run in this tray.</p>
      ) : (
        <ol ref={list} className={styles.list}>
          {resolved.map((r) => (
            <li key={r.cable.id} data-arrive={r.cable.id} className={styles.row}>
              <CableTag tag={r.tag} colourIndex={r.colourIndex} />
              <div className={styles.text}>
                <span className={styles.title}>
                  {r.title}
                  {r.cable.kind === 'manual' && <Chip tone="neutral">MANUAL</Chip>}
                </span>
                <span className={styles.subtitle}>
                  {r.subtitle}
                  {r.catalog && (
                    <>
                      {' · '}
                      <button type="button" className={styles.catalogLink} aria-label={`View cable ${r.tag} in the catalog`} onClick={() => openCatalog(r.catalog!.id)}>
                        view in catalog
                      </button>
                    </>
                  )}
                </span>
                {r.problem && (
                  <span className={styles.problem} data-severity={r.problem.severity}>
                    {r.problem.severity === 'error' ? 'Not used in sizing: ' : 'Check: '}
                    {r.problem.message}
                  </span>
                )}
                <div className={styles.controls}>
                  <span className={styles.od}>{r.odMm === null ? 'Ø –' : `Ø ${num1(r.odMm)} mm`}</span>
                  <QuantityStepper label={`Quantity of cable ${r.tag}`} value={r.cable.quantity} onChange={(q) => setQuantity(tray.id, r.cable.id, q)} />
                </div>
              </div>
              <button type="button" className={styles.remove} aria-label={`Remove cable ${r.tag}, ${r.title}`} onClick={() => removeCable(tray.id, r.cable.id)}>
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <button ref={addButton} type="button" className={styles.add} disabled={full} onClick={() => setPickerOpen(true)}>
        + Add cable
      </button>
      {full && <p className={styles.limit}>A tray holds up to {MAX_CABLE_ROWS} cable rows. Raise quantities on existing rows, or split the tray.</p>}
      <CablePicker
        open={pickerOpen}
        trayName={tray.name}
        onClose={() => {
          setPickerOpen(false);
          addButton.current?.focus();
        }}
        onAdd={(cable) => addCable(tray.id, cable)}
      />
    </Panel>
  );
}
