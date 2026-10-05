import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { createProject } from '../state/projectModel';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';

// jsdom has <dialog> but not its modal methods.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  useUiStore.setState({ theme: 'system', compactPane: 'inputs', view: 'tray', compareHidden: [], dialog: null, catalogFocusId: null, showCataloguePages: false });
  useProjectStore.setState({ project: createProject(), saveState: { status: 'saved', savedAt: 0 }, notice: null, past: [], future: [], lastEdit: null });
});
