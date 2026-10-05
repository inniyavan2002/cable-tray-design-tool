/** New, Open and Save project, as used by the top bar and keyboard shortcuts. */
import { loadCatalog } from '../../data/catalog';
import { projectFileContent, projectFileName, readProjectFile } from '../../state/projectFile';
import { createProject } from '../../state/projectModel';
import { useProjectStore } from '../../state/projectStore';

/** Downloads the project as a .ctd.json file. */
export async function saveProjectFile(): Promise<void> {
  const { project, showNotice } = useProjectStore.getState();
  const { saveFile } = await import('../../export/browserFiles');
  const name = projectFileName(project);
  saveFile(new Blob([projectFileContent(project, loadCatalog(), __APP_VERSION__)], { type: 'application/json' }), name);
  showNotice({ tone: 'info', text: `Saved ${name}. Your browser puts it in your downloads folder unless it asks where to save.`, after: project });
}

export async function openProjectFile(file: File): Promise<void> {
  const { replaceProject, showNotice } = useProjectStore.getState();
  let text: string;
  try {
    text = await file.text();
  } catch {
    showNotice({ tone: 'error', text: `${file.name} could not be read.` });
    return;
  }
  const opened = readProjectFile(text, loadCatalog());
  if (!opened.ok) {
    showNotice({ tone: 'error', text: `Could not open ${file.name}. ${opened.error}` });
    return;
  }
  const trays = opened.project.trays.length;
  const what = opened.fromPreviousTool
    ? `Imported ${trays} tray${trays === 1 ? '' : 's'} from ${file.name}, saved by the previous tool.`
    : `Opened ${file.name}.`;
  const check = opened.warnings.length ? ' Check these cables:' : '';
  replaceProject(opened.project, 'open project', { tone: opened.warnings.length ? 'warn' : 'info', text: `${what}${check}`, details: opened.warnings });
}

/** Starts an empty project that keeps the current standard sizes and tray defaults. */
export function startNewProject(): void {
  const { project, replaceProject } = useProjectStore.getState();
  replaceProject(createProject(project), 'start a new project', { tone: 'info', text: 'Started a new project with the same standard sizes and tray defaults.' });
}
