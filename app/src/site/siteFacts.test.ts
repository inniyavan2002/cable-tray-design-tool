import { describe, expect, it } from 'vitest';
import facts from '../../site/facts.json';
import { loadCatalog } from '../data/catalog';
import { siteFacts } from './siteFacts';

describe('website figures', () => {
  const current = siteFacts(loadCatalog());

  it('match the app, so the website never quotes old figures', () => {
    expect(facts.app, 'site/facts.json is out of date: run npm run site:facts').toEqual(current);
  });

  it('come from the catalog and the example trays', () => {
    expect(current.catalog).toMatchObject({ rows: '2,455', manufacturers: '9' });
    expect(current.catalog.brands.map((b) => b.name)).toEqual([
      'alfanar',
      'Bahra Electric',
      'Doha Cables',
      'Ducab',
      'Jeddah Cable Company',
      'Oman Cables',
      'RAMCRO',
      'Riyadh Cables',
      'Saudi Cable Company',
    ]);
    expect(current.trays.map((t) => t.name)).toEqual(['TR-01', 'TR-02', 'TR-03']);
    expect(current.trays[2]!.selected).toBe(current.t3.selected);
    expect(current.trays[1]).toMatchObject({ selected: '300 × 75', fill: '34.3%', cables: '20', weight: '14.9 kg/m', rowsWithoutWeight: 1 });
    expect(current.t2).toMatchObject({ required: '288.7 × 47.0 mm', firstTry: '300 × 50', firstFill: '51.5%', selected: '300 × 75', selectedFill: '34.3%', cableArea: '7,718' });
    expect(current.t2Drawing.shapes.filter((s) => s.kind === 'cable')).toHaveLength(20);
    expect(current.t3).toMatchObject({ selected: '450 × 150', fill: '20.8%', clearance: '30.2', spare: '64.5', unused: '2.9', cableArea: '14,065' });
  });

  it('list a size for every catalogue the website links to', () => {
    for (const b of current.catalog.brands) expect(facts.files.pdfMb, b.pdfFile).toHaveProperty([b.pdfFile]);
  });
});
