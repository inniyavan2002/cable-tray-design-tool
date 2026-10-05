import { describe, expect, it } from 'vitest';
import { normalizeArmour, normalizeConductor, normalizeInsulation, normalizeRow, normalizeVoltage, parseCores } from './normalize';
import type { LegacyCatalogRow } from './types';

const bahraRow: LegacyCatalogRow = {
  brand: 'Bahra',
  category: 'LV Power Cable',
  standard: 'IEC 60502-1',
  voltage: '0.6/1kV',
  conductor: 'Aluminium',
  insulation: 'PVC',
  armour: 'Unarmoured',
  coreConfig: 'Single Core',
  size: '16',
  unit: 'sq.mm',
  phaseSize: '16',
  neutralSize: '',
  form: 'rmc',
  wires: '7',
  insulationThickness: '1.0',
  sheathThickness: '1.4',
  od: 9.7,
  weight: 132,
  code: '14210001',
  drum: '1000/2000',
  sourcePage: 45,
  raw: ['14210001', '16rmc', '7', '1.0', '1.4', '9.7', '132', '1000/2000'],
  id: 'mdb_1',
};

describe('field normalisation', () => {
  it('reads core counts written as digits or words', () => {
    expect(parseCores('4 Core')).toBe(4);
    expect(parseCores('Four Core')).toBe(4);
    expect(parseCores('Single Core')).toBe(1);
    expect(parseCores('4 Core Reduced Neutral')).toBe(4);
    expect(parseCores('19 Core')).toBe(19);
    expect(parseCores('Multi Core')).toBeNull();
  });

  it('spells each voltage rating one way', () => {
    expect(normalizeVoltage('0.6/1kV')).toBe('0.6/1 kV');
    expect(normalizeVoltage('0.6/1 kV')).toBe('0.6/1 kV');
    expect(normalizeVoltage('0.6/1 (1.2) kV')).toBe('0.6/1 kV');
    expect(normalizeVoltage('1.8/3 kV')).toBe('1.8/3 kV');
    expect(normalizeVoltage('1900/3300 V')).toBe('1.9/3.3 kV');
    expect(normalizeVoltage('')).toBeNull();
  });

  it('shortens materials and keeps only known armour types', () => {
    expect(normalizeConductor('Copper')).toBe('Cu');
    expect(normalizeConductor('Aluminium')).toBe('Al');
    expect(normalizeConductor('')).toBeNull();
    expect(normalizeInsulation('PVC (TYPE A)')).toBe('PVC');
    expect(normalizeInsulation('XLPE')).toBe('XLPE');
    expect(normalizeArmour('SWA')).toBe('SWA');
    expect(normalizeArmour('')).toBeNull();
  });
});

describe('normalizeRow', () => {
  it('converts an original row to the app format', () => {
    const c = normalizeRow(bahraRow);
    expect(c).toMatchObject({
      id: 'bahra-1',
      legacyId: 'mdb_1',
      brandId: 'bahra',
      brand: 'Bahra Electric',
      category: 'LV power',
      standard: 'IEC 60502-1',
      voltage: '0.6/1 kV',
      conductor: 'Al',
      insulation: 'PVC',
      armour: 'Unarmoured',
      screen: null,
      cores: 1,
      reducedNeutral: false,
      sizeMm2: 16,
      conductorShape: 'rmc',
      odMm: 9.7,
      weightKgPerKm: 132,
      code: '14210001',
      variant: '14210001',
      source: { file: 'Bahra electric cables.pdf', page: 45, raw: '14210001 16rmc 7 1.0 1.4 9.7 132 1000/2000' },
    });
    expect(c.details).toMatchObject({ 'Number of wires': '7', 'Drum / package (m)': '1000/2000' });
  });

  it('recovers the neutral size of reduced-neutral cables from the original columns', () => {
    const c = normalizeRow({ ...bahraRow, coreConfig: '4 Core Reduced Neutral', size: '25', raw: ['25rm', '16rm', '7'] });
    expect(c.reducedNeutral).toBe(true);
    expect(c.neutralSizeMm2).toBe(16);
  });

  it('uses the page as the variant when there is no product code, and handles text source pages', () => {
    expect(normalizeRow({ ...bahraRow, code: '' }).variant).toBe('page 45');
    const ocr = normalizeRow({ ...bahraRow, code: '', sourcePage: 'OCR catalogue', raw: '4x16 rm' });
    expect(ocr.source.page).toBeNull();
    expect(ocr.variant).toBe('no code or page');
    expect(ocr.source.raw).toBe('4x16 rm');
  });

  it('keeps ids unique across the different legacy id formats', () => {
    expect(normalizeRow({ ...bahraRow, id: 'mdb_v13_1926', brand: 'Saudi Cable Company' }).id).toBe('saudi-1926');
  });

  it('rejects a brand it does not know', () => {
    expect(() => normalizeRow({ ...bahraRow, brand: 'Unknown Cables' })).toThrow(/Unknown catalog brand/);
  });
});
