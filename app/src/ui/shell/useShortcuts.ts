import { useEffect } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { saveProjectFile } from '../project/projectFiles';

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);

/** Text fields keep their own Ctrl+Z, which undoes typing inside the field. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NOT_TEXT.has(target.type);
}

/**
 * Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo (Cmd on a Mac), and Ctrl+S to save
 * a project file. Undo and redo wait while a dialog is open, since dialogs
 * edit their own copy of the values.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void saveProjectFile();
        return;
      }
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
      if (!isUndo && !isRedo) return;
      if (isTextEntry(e.target) || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      const store = useProjectStore.getState();
      if (isUndo) store.undo();
      else store.redo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
