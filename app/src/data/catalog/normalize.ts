import { brandByLegacyName } from './brands';
import type { Armour, CatalogCable, Conductor, Insulation, LegacyCatalogRow } from './types';

const CORE_WORDS: Record<string, number> = { single: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

/** "4 Core", "Four Core", "Single Core", "4 Core Reduced Neutral" → 4 / 4 / 1 / 4; "Multi Core" → null. */
export function parseCores(coreConfig: string): number | null {
  const text = coreConfig.trim().toLowerCase();
  const digits = /^(\d+)\s*core/.exec(text);
  if (digits) return Number(digits[1]);
  const word = /^([a-z]+)\s+core/.exec(text)?.[1];
  return word && word in CORE_WORDS ? CORE_WORDS[word]! : null;
}

/** One spelling per rating: "0.6/1kV", "0.6/1 kV" and "0.6/1 (1.2) kV" are all "0.6/1 kV". */
export function normalizeVoltage(voltage: string): string | null {
  const compact = voltage.replace(/\s+/g, '');
  if (!compact) return null;
  if (/^0\.6\/1(\(1\.2\))?kV$/i.test(compact)) return '0.6/1 kV';
  if (/^1\.8\/3(\(3\.6\))?kV$/i.test(compact)) return '1.8/3 kV';
  if (/^1900\/3300V$/i.test(compact)) return '1.9/3.3 kV';
  return voltage.trim();
}

export function normalizeConductor(conductor: string): Conductor | null {
  if (/^copper$/i.test(conductor.trim())) return 'Cu';
  if (/^alumin(i)?um$/i.test(conductor.trim())) return 'Al';
  return null;
}

/** "PVC (TYPE A)" is PVC; the grade stays in the original text. */
export function normalizeInsulation(insulation: string): Insulation | null {
  if (/^pvc/i.test(insulation.trim())) return 'PVC';
  if (/^xlpe/i.test(insulation.trim())) return 'XLPE';
  return null;
}

export function normalizeArmour(armour: string): Armour | null {
  const value = armour.trim();
  return value === 'Unarmoured' || value === 'SWA' || value === 'STA' || value === 'AWA' ? value : null;
}

function text(value: unknown): string | null {
  const s = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return s ? s : null;
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Reduced-neutral rows stored the neutral size only in the original columns, e.g. ["25rm", "16rm", …]. */
function neutralSize(row: LegacyCatalogRow): number | null {
  const stated = positiveNumber(row.neutralSize);
  if (stated) return stated;
  if (!/reduced neutral/i.test(row.coreConfig) || !Array.isArray(row.raw)) return null;
  const match = /^(\d+(?:\.\d+)?)[a-z]*$/i.exec(row.raw[1] ?? '');
  return match ? Number(match[1]) : null;
}

const DETAIL_FIELDS: ReadonlyArray<[keyof LegacyCatalogRow, string]> = [
  ['wires', 'Number of wires'],
  ['insulationThickness', 'Insulation thickness (mm)'],
  ['sheathThickness', 'Sheath thickness (mm)'],
  ['armourThickness', 'Armour thickness (mm)'],
  ['armourWireDiameter', 'Armour wire diameter (mm)'],
  ['outerSheathThickness', 'Outer sheath thickness (mm)'],
  ['drum', 'Drum / package (m)'],
];

/** Label that tells apart rows with the same specification: the product code, else the catalogue page. */
export function baseVariant(c: Pick<CatalogCable, 'code' | 'source'>): string {
  return c.code ?? (c.source.page ? `page ${c.source.page}` : 'no code or page');
}

/** Converts one original row into the app's catalog format, before any checks. */
export function normalizeRow(row: LegacyCatalogRow): CatalogCable {
  const brand = brandByLegacyName(row.brand);
  const number = /(\d+)$/.exec(row.id)?.[1];
  if (!number) throw new Error(`Catalog row id "${row.id}" has no number`);
  const page = typeof row.sourcePage === 'number' && row.sourcePage > 0 ? row.sourcePage : positiveNumber(row.sourcePage);
  const code = text(row.code);
  const details: Record<string, string> = {};
  for (const [field, label] of DETAIL_FIELDS) {
    const value = text(row[field]);
    if (value && value !== '-') details[label] = value;
  }

  const source = {
    file: brand.pdfFile,
    page: page !== null && Number.isInteger(page) ? page : null,
    raw: Array.isArray(row.raw) ? row.raw.join(' ') : String(row.raw ?? ''),
  };

  return {
    id: `${brand.id}-${number}`,
    legacyId: row.id,
    brandId: brand.id,
    brand: brand.name,
    category: /special|fire|control/i.test(row.category) ? 'Fire, control and special' : 'LV power',
    standard: text(row.standard),
    voltage: normalizeVoltage(row.voltage ?? ''),
    conductor: normalizeConductor(row.conductor ?? ''),
    insulation: normalizeInsulation(row.insulation ?? ''),
    armour: normalizeArmour(row.armour ?? ''),
    screen: /copper tape/i.test(row.shield ?? '') ? 'Copper tape' : null,
    cores: parseCores(row.coreConfig),
    reducedNeutral: /reduced neutral/i.test(row.coreConfig),
    sizeMm2: positiveNumber(row.size) ?? 0,
    neutralSizeMm2: neutralSize(row),
    conductorShape: text(row.form)?.toLowerCase() ?? null,
    odMm: row.od,
    weightKgPerKm: positiveNumber(row.weight),
    code,
    variant: baseVariant({ code, source }),
    details,
    source,
    status: 'checked',
    flags: [],
    review: null,
  };
}
