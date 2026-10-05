import { useRef, useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { cachedTrayOutcome } from '../../state/trayResult';
import { useUiStore } from '../../state/uiStore';
import { Chip } from '../common/controls';
import { useReorderMotion } from '../common/motion';
import { STATUS_TEXT, traySizeText } from '../results/status';
import styles from './TrayList.module.css';

export function TrayList() {
  const trays = useProjectStore((s) => s.project.trays);
  const activeId = useProjectStore((s) => s.project.activeTrayId);
  const standards = useProjectStore((s) => s.project.standards);
  const { selectTray, addTray, duplicateTray, removeTray, moveTray } = useProjectStore.getState();
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  useReorderMotion(list, trays.map((t) => t.id));
  const activeIndex = Math.max(0, trays.findIndex((t) => t.id === activeId));
  const active = trays[activeIndex]!;

  const endDrag = () => {
    setDragId(null);
    setDropIndex(null);
  };

  return (
    <nav className={styles.rail} aria-labelledby="trays-heading">
      <div className={styles.head}>
        <h2 id="trays-heading" className={styles.title}>
          Trays
        </h2>
        <span className={styles.count}>{trays.length}</span>
      </div>
      <ul ref={list} className={styles.list}>
        {trays.map((tray, index) => {
          const { result } = cachedTrayOutcome(tray, standards);
          const status = STATUS_TEXT[result.status];
          return (
            <li
              key={tray.id}
              data-flip={tray.id}
              draggable
              className={styles.item}
              data-dragging={dragId === tray.id ? 'true' : undefined}
              data-drop-target={dragId && dragId !== tray.id && dropIndex === index ? 'true' : undefined}
              onDragStart={(e) => {
                setDragId(tray.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tray.name);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setDropIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) moveTray(dragId, index);
                endDrag();
              }}
              onDragEnd={endDrag}
            >
              <button
                type="button"
                className={styles.tray}
                aria-current={tray.id === active.id ? 'true' : undefined}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                onClick={() => {
                  setConfirmingDelete(false);
                  selectTray(tray.id);
                  setView('tray');
                }}
                onKeyDown={(e) => {
                  if (!e.altKey) return;
                  const step = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
                  if (!step) return;
                  e.preventDefault();
                  moveTray(tray.id, index + step);
                }}
              >
                <span className={styles.name}>{tray.name || 'Unnamed'}</span>
                <Chip tone={status.tone}>{status.short}</Chip>
                <span className={styles.service}>{tray.service || 'No service set'}</span>
                <span className={styles.size}>{traySizeText(result)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.add} onClick={addTray}>
          + Add tray
        </button>
        <button
          type="button"
          className={styles.compare}
          aria-pressed={view === 'compare'}
          disabled={trays.length < 2 && view !== 'compare'}
          title={trays.length < 2 ? 'Add a second tray to compare' : undefined}
          onClick={() => setView(view === 'compare' ? 'tray' : 'compare')}
        >
          <span aria-hidden="true">⇄</span> Compare trays
        </button>
        {confirmingDelete ? (
          <div className={styles.confirm} role="group" aria-label={`Delete ${active.name}?`}>
            <span>Delete {active.name}?</span>
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                removeTray(active.id);
                setConfirmingDelete(false);
              }}
            >
              Delete
            </button>
            <button type="button" className={styles.action} onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className={styles.row}>
              <button
                type="button"
                className={styles.action}
                aria-label={`Move ${active.name} up`}
                title="Alt+↑ on a tray also moves it"
                disabled={activeIndex === 0}
                onClick={() => moveTray(active.id, activeIndex - 1)}
              >
                <span className={styles.arrow} aria-hidden="true">
                  ↑
                </span>{' '}
                Up
              </button>
              <button
                type="button"
                className={styles.action}
                aria-label={`Move ${active.name} down`}
                title="Alt+↓ on a tray also moves it"
                disabled={activeIndex === trays.length - 1}
                onClick={() => moveTray(active.id, activeIndex + 1)}
              >
                <span className={styles.arrow} aria-hidden="true">
                  ↓
                </span>{' '}
                Down
              </button>
            </div>
            <div className={styles.row}>
              <button type="button" className={styles.action} aria-label={`Duplicate ${active.name}`} onClick={() => duplicateTray(active.id)}>
                Duplicate
              </button>
              <button
                type="button"
                className={styles.action}
                aria-label={`Delete ${active.name}`}
                disabled={trays.length <= 1}
                title={trays.length <= 1 ? 'A project needs at least one tray' : undefined}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
