import { describe, expect, it } from 'vitest';
import { loadCatalog } from './index';
import { parseQuery, searchCatalog } from './search';

const { cables } = loadCatalog();

describe('parseQuery', () => {
  it('reads cores, size, materials, armour, voltage and brand from typed words', () => {
    expect(parseQuery('4c 240 cu xlpe swa 0.6/1kv doha')).toEqual({
      filters: {
        cores: ['4'],
        sizeMm2: ['240'],
        conductor: ['Cu'],
        insulation: ['XLPE'],
        armour: ['SWA'],
        voltage: ['0.6/1 kV'],
        brand: ['Doha Cables'],
      },
      textTerms: [],
    });
  });

  it('understands "4x240" and "3 core" style input', () => {
    expect(parseQuery('4x240mm2').filters).toEqual({ cores: ['4'], sizeMm2: ['240'] });
    expect(parseQuery('3core al').filters).toEqual({ cores: ['3'], conductor: ['Al'] });
  });

  it('keeps unrecognised words as text to match', () => {
    expect(parseQuery('CX1-T105').textTerms).toEqual(['cx1-t105']);
  });
});

describe('searchCatalog', () => {
  it('finds the four 4-core 240 mm² Cu/XLPE/SWA cables from the plan mock-up, thinnest first', () => {
    const result = searchCatalog(cables, { query: '4c 240 cu xlpe swa' });
    expect(result.cables.map((c) => [c.brand, c.odMm])).toEqual([
      ['Bahra Electric', 57.8],
      ['Doha Cables', 60.3],
      ['Oman Cables', 61],
      ['Oman Cables', 61.5],
    ]);
    expect(result.cables.find((c) => c.odMm === 61)?.status).toBe('needs-review');
  });

  it('finds a cable by product code', () => {
    const result = searchCatalog(cables, { query: 'CX1-T105-W20' });
    expect(result.cables.map((c) => c.id)).toEqual(['doha-1873']);
  });

  it('leaves excluded rows out unless asked', () => {
    expect(searchCatalog(cables, { query: 'jeddah' }).cables.some((c) => c.status === 'excluded')).toBe(false);
    expect(searchCatalog(cables, { query: 'jeddah', includeExcluded: true }).cables.some((c) => c.status === 'excluded')).toBe(true);
  });

  it('counts each filter value without applying that filter to itself', () => {
    const result = searchCatalog(cables, { filters: { cores: ['4'], sizeMm2: ['240'], armour: ['SWA'] } });
    const armour = result.facets.armour.map((f) => f.value);
    expect(armour).toEqual(expect.arrayContaining(['SWA', 'Unarmoured']));
    expect(result.facets.sizeMm2.map((f) => Number(f.value))).toEqual([...result.facets.sizeMm2.map((f) => Number(f.value))].sort((a, b) => a - b));
    expect(result.cables.every((c) => c.cores === 4 && c.sizeMm2 === 240 && c.armour === 'SWA')).toBe(true);
  });

  it('combines typed words with selected filters', () => {
    const result = searchCatalog(cables, { query: '240', filters: { brand: ['Doha Cables'] } });
    expect(result.cables.length).toBeGreaterThan(0);
    expect(result.cables.every((c) => c.brand === 'Doha Cables' && c.sizeMm2 === 240)).toBe(true);
  });
});
