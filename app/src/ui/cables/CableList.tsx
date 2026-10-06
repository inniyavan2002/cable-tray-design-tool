import { useRef, useState } from 'react';
import { useArrivalMotion } from '../common/motion';
import { num1 } from '../../domain/format';
import { MAX_CABLE_ROWS, type Tray } from '../../state/projectModel';
import { useProjectStore } from '../../state/projectStore';
import type { ResolvedCable } from '../../state/trayResult';
import { useUiStore, type PickerTab } from '../../state/uiStore';
import { Chip, QuantityStepper } from '../common/controls';
import { Panel } from '../common/Panel';
import { CablePicker } from '../picker/CablePicker';
import { STEP_TARGETS } from '../shell/steps';
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
  const [pickerTab, setPickerTab] = useState<PickerTab | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useArrivalMotion(
    list,
    tray.id,
    tray.cables.map((c) => c.id),
  );
  const total = tray.cables.reduce((sum, c) => sum + c.quantity, 0);
  const full = tray.cables.length >= MAX_CABLE_ROWS;

  // Other parts of the workspace ask for the add-cable dialog through the UI store.
  const request = useUiStore((s) => s.cablePickerRequest);
  const [seenRequest, setSeenRequest] = useState(request);
  if (request !== seenRequest) {
    setSeenRequest(request);
    if (request && !full) {
      setPickerTab(request.tab);
      setPickerOpen(true);
    }
  }

  return (
    <Panel id={STEP_TARGETS.cables} title="Cables" meta={`${tray.cables.length} row${tray.cables.length === 1 ? '' : 's'} · ${total} cable${total === 1 ? '' : 's'}`}>
      {resolved.length === 0 ? (
        <div className={styles.empty}>
          <svg className={styles.emptyIcon} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
            <path d="M2 3v22h36V3" className={styles.emptyRail} />
            <circle cx="11" cy="18" r="6" />
            <circle cx="23.5" cy="19.5" r="4.5" />
            <circle cx="32" cy="20.5" r="3.5" />
          </svg>
          <div>
            <p className={styles.emptyTitle}>No cables yet.</p>
            <p>The tray is sized from the outside diameter and quantity of each cable it carries. Add them from the catalogue, or enter a cable's OD by hand.</p>
          </div>
        </div>
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
      <button
        ref={addButton}
        type="button"
        className={styles.add}
        data-first={resolved.length === 0 ? 'true' : undefined}
        disabled={full}
        onClick={() => {
          setPickerTab(null);
          setPickerOpen(true);
        }}
      >
        + Add cable
      </button>
      {full && <p className={styles.limit}>A tray holds up to {MAX_CABLE_ROWS} cable rows. Raise quantities on existing rows, or split the tray.</p>}
      <CablePicker
        open={pickerOpen}
        trayName={tray.name}
        tab={pickerTab}
        onClose={() => {
          setPickerOpen(false);
          addButton.current?.focus();
        }}
        onAdd={(cable) => addCable(tray.id, cable)}
      />
    </Panel>
  );
}
