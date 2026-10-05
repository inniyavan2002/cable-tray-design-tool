/** The reference trays T1–T3 from the frontend plan as a project, for tests and sample reports. */
import { createProject, createTray, type Project, type Tray } from '../../state/projectModel';

let n = 0;
const cable = (catalogId: string, quantity: number) => ({ id: `c${++n}`, kind: 'catalog' as const, catalogId, quantity });

export function sampleProject(): Project {
  const project = createProject();
  project.name = 'Example Project';
  project.details = {
    number: 'EX-2026-014',
    client: 'Example Client',
    preparedBy: 'A. Engineer',
    checkedBy: 'B. Checker',
    revision: 'A',
    date: '2026-09-28',
  };

  const t1: Tray = {
    ...project.trays[0]!,
    name: 'TR-01',
    service: 'LV feeders',
    cables: [cable('doha-1873', 2), cable('doha-1869', 3), cable('doha-1866', 4)],
  };
  const t2: Tray = {
    ...createTray('TR-02'),
    service: 'Small power',
    cables: [cable('oman-100347', 12), cable('oman-100337', 8)],
  };
  t2.settings = { ...t2.settings, layers: 2, spacing: 0, layerGap: false };
  const t3: Tray = {
    ...createTray('TR-03'),
    service: 'Mixed',
    cables: [cable('doha-1873', 2), cable('doha-1868', 4), cable('doha-1866', 6)],
  };
  t3.settings = { ...t3.settings, layers: 2, spacing: 0.5, layerGap: true };

  project.trays = [t1, t2, t3];
  project.activeTrayId = t1.id;
  return project;
}
