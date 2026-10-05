/**
 * Automatic plausibility checks on the catalog. Each problem becomes a flag:
 * errors exclude the row from cable selection, warnings mark it for review,
 * and info flags only explain something to the user.
 */
import { int, num1, plain } from '../../domain/format';
import { baseVariant } from './normalize';
import type { CatalogCable, CatalogFlag, CatalogStatus, FlagCode, FlagSeverity } from './types';

/** IEC 60228 conductor sizes, mm². */
export const STANDARD_SIZES_MM2: readonly number[] = [
  0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630, 800, 1000, 1200,
];

/**
 * Plausible OD as a multiple of the diameter the conductors would occupy if
 * packed into one circle, by total conductor area. "typical" is the 1st to
 * 99th percentile of the catalog's own plausible rows; "warn" is a little
 * wider. Small cables have thick insulation relative to the copper, so their
 * ratios are higher.
 */
export const OD_BANDS: ReadonlyArray<{ maxAreaMm2: number; typical: [number, number]; warn: [number, number] }> = [
  { maxAreaMm2: 5, typical: [2.9, 9.4], warn: [2.3, 10] },
  { maxAreaMm2: 15, typical: [1.25, 5.8], warn: [1.1, 6.5] },
  { maxAreaMm2: 40, typical: [1.4, 4.4], warn: [1.15, 5] },
  { maxAreaMm2: 100, typical: [1.5, 3.6], warn: [1.15, 4] },
  { maxAreaMm2: 300, typical: [1.4, 2.8], warn: [1.15, 3.2] },
  { maxAreaMm2: 1000, typical: [1.37, 2.3], warn: [1.15, 2.6] },
  { maxAreaMm2: Infinity, typical: [1.39, 2.1], warn: [1.15, 2.5] },
];

/** Below 1 the cable would be thinner than its own conductors; above 12 a decimal point was lost. */
const OD_RATIO_IMPOSSIBLE = { below: 1, above: 12 };
/** Used when the core count is unknown and the ratio cannot be worked out. */
const OD_ABSOLUTE_MM = { min: 3, max: 150 };
/** Conductor mass per mm² of cross-section per km of cable. */
const CONDUCTOR_KG_PER_MM2_KM = { Cu: 8.89, Al: 2.7 } as const;
/** A cable weighs at least its conductors; allow for rounding in catalogue tables. */
const MIN_WEIGHT_VS_CONDUCTOR = 0.8;
/** Within one product range, a larger size may be this much thinner before it is flagged. */
const ORDER_TOLERANCE_MM = 0.5;

export function conductorAreaMm2(c: CatalogCable): number | null {
  if (c.cores === null || !(c.sizeMm2 > 0)) return null;
  if (c.reducedNeutral && c.neutralSizeMm2) return (c.cores - 1) * c.sizeMm2 + c.neutralSizeMm2;
  return c.cores * c.sizeMm2;
}

export function describeCable(c: Pick<CatalogCable, 'cores' | 'sizeMm2'>): string {
  return `${c.cores ?? 'multi'}-core ${plain(c.sizeMm2)} mm²`;
}

function flag(code: FlagCode, severity: FlagSeverity, message: string): CatalogFlag {
  return { code, severity, message };
}

function odFlags(c: CatalogCable): CatalogFlag[] {
  const area = conductorAreaMm2(c);
  if (area === null) {
    const flags = [flag('cores-unknown', 'warning', `The catalogue gives no core count, so the OD of ${num1(c.odMm)} mm cannot be checked against the size.`)];
    if (c.odMm < OD_ABSOLUTE_MM.min || c.odMm > OD_ABSOLUTE_MM.max) {
      flags.push(flag('od-impossible', 'error', `OD of ${num1(c.odMm)} mm is outside ${OD_ABSOLUTE_MM.min}–${OD_ABSOLUTE_MM.max} mm.`));
    }
    return flags;
  }
  const packedDiameter = Math.sqrt((4 * area) / Math.PI);
  const ratio = c.odMm / packedDiameter;
  const band = OD_BANDS.find((b) => area <= b.maxAreaMm2)!;
  const typical = `typically ${num1(band.typical[0] * packedDiameter)}–${num1(band.typical[1] * packedDiameter)} mm`;
  if (ratio < OD_RATIO_IMPOSSIBLE.below) {
    return [flag('od-impossible', 'error', `OD of ${num1(c.odMm)} mm is smaller than the conductors of a ${describeCable(c)} cable (${typical}).`)];
  }
  if (ratio > OD_RATIO_IMPOSSIBLE.above) {
    return [
      flag('od-impossible', 'error', `OD of ${num1(c.odMm)} mm is far too large for a ${describeCable(c)} cable (${typical}); a decimal point was probably lost.`),
    ];
  }
  if (ratio < band.warn[0] || ratio > band.warn[1]) {
    return [flag('od-unusual', 'warning', `OD of ${num1(c.odMm)} mm is unusual for a ${describeCable(c)} cable (${typical}).`)];
  }
  return [];
}

/** Returns the flag, if any; an implausible weight is hidden rather than used. */
function weightFlag(c: CatalogCable): CatalogFlag | null {
  const weight = c.weightKgPerKm;
  if (weight === null) return null;
  const area = conductorAreaMm2(c);
  if (area !== null && c.conductor) {
    const conductorMass = area * CONDUCTOR_KG_PER_MM2_KM[c.conductor];
    if (weight < MIN_WEIGHT_VS_CONDUCTOR * conductorMass) {
      const aluminiumMass = area * CONDUCTOR_KG_PER_MM2_KM.Al;
      if (c.conductor === 'Cu' && weight >= MIN_WEIGHT_VS_CONDUCTOR * aluminiumMass) {
        return flag(
          'conductor-suspect',
          'warning',
          `Weight of ${plain(weight)} kg/km is too light for copper conductors (about ${int(conductorMass)} kg/km) but fits aluminium (about ${int(aluminiumMass)} kg/km); the conductor may be aluminium.`,
        );
      }
      return flag(
        'weight-implausible',
        'warning',
        `Weight of ${plain(weight)} kg/km is less than the conductors alone (about ${int(conductorMass)} kg/km), so it is not used.`,
      );
    }
  }
  const solidCopperRod = CONDUCTOR_KG_PER_MM2_KM.Cu * (Math.PI / 4) * c.odMm * c.odMm;
  if (weight > solidCopperRod) {
    return flag('weight-implausible', 'warning', `Weight of ${plain(weight)} kg/km is more than a solid copper rod of this OD, so it is not used.`);
  }
  const drums = (c.details['Drum / package (m)'] ?? '').split('/').map(Number);
  if (drums.includes(weight)) {
    return flag('weight-implausible', 'warning', `Weight of ${plain(weight)} kg/km equals the drum length; the columns were probably mixed up, so it is not used.`);
  }
  return null;
}

function rowChecks(c: CatalogCable): CatalogCable {
  const flags = odFlags(c);
  if (!STANDARD_SIZES_MM2.includes(c.sizeMm2)) {
    flags.push(flag('size-nonstandard', 'warning', `${plain(c.sizeMm2)} mm² is not a standard conductor size; the size was probably misread.`));
  }
  if (c.conductor === null) {
    flags.push(flag('conductor-missing', 'warning', 'Conductor material (copper or aluminium) is missing from the catalogue data.'));
  }
  const weight = weightFlag(c);
  if (weight) flags.push(weight);
  // A suspect conductor keeps its weight: the weight is probably right and the material wrong.
  const hideWeight = weight?.code === 'weight-implausible';
  return { ...c, flags, variant: baseVariant(c), weightKgPerKm: hideWeight ? null : c.weightKgPerKm };
}

/** RAMCRO codes such as SAR0311HFESP-F3PH120 encode cores and size; what is left identifies the product range. */
function productLine(c: CatalogCable): string {
  if (c.brandId !== 'ramcro' || !c.code) return '';
  const match = /^([A-Z]{3})\d{4}([A-Z]+?)[A-Z]?-(.+)$/.exec(c.code);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : c.code;
}

const familyKey = (c: CatalogCable) =>
  [c.brandId, c.category, c.standard, c.voltage, c.conductor, c.insulation, c.armour, c.screen, c.cores, c.reducedNeutral, c.conductorShape, c.source.page, productLine(c)].join('|');

/** What a user filters on when picking a cable; rows sharing it look alike in the picker. */
const specKey = (c: CatalogCable) =>
  [c.brandId, c.category, c.standard, c.voltage, c.conductor, c.insulation, c.armour, c.screen, c.cores, c.reducedNeutral, c.sizeMm2].join('|');

function groupBy<T>(items: readonly T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return [...groups.values()];
}

/** Within one product range, a larger conductor should not have a smaller OD. */
function orderChecks(cables: CatalogCable[]): void {
  for (const family of groupBy(cables, familyKey)) {
    const sizes = [...new Set(family.map((c) => c.sizeMm2))].sort((a, b) => a - b);
    for (let i = 1; i < sizes.length; i++) {
      const smaller = family.filter((c) => c.sizeMm2 === sizes[i - 1]);
      const larger = family.filter((c) => c.sizeMm2 === sizes[i]);
      const smallerMax = Math.max(...smaller.map((c) => c.odMm));
      const largerMin = Math.min(...larger.map((c) => c.odMm));
      if (largerMin >= smallerMax - ORDER_TOLERANCE_MM) continue;
      for (const c of larger.filter((x) => x.odMm < smallerMax - ORDER_TOLERANCE_MM)) {
        c.flags.push(flag('od-order', 'warning', `OD of ${num1(c.odMm)} mm is smaller than ${num1(smallerMax)} mm for the smaller ${plain(sizes[i - 1]!)} mm² size in the same product range.`));
      }
      for (const c of smaller.filter((x) => x.odMm > largerMin + ORDER_TOLERANCE_MM)) {
        c.flags.push(flag('od-order', 'warning', `OD of ${num1(c.odMm)} mm is larger than ${num1(largerMin)} mm for the larger ${plain(sizes[i]!)} mm² size in the same product range.`));
      }
    }
  }
}

/** Sizes in one product range sharing a weight before it counts as a drum length. */
const REPEATED_WEIGHT_SIZES = 3;

/**
 * Weight grows with conductor size, so one value listed for several sizes of
 * a product range is a column mix-up (usually the drum length). Those weights
 * are hidden; the cables stay usable because weight does not change tray size.
 */
function repeatedWeightChecks(cables: CatalogCable[]): void {
  for (const family of groupBy(cables, familyKey)) {
    const sizesByWeight = new Map<number, Set<number>>();
    for (const c of family) {
      if (c.weightKgPerKm === null) continue;
      const sizes = sizesByWeight.get(c.weightKgPerKm) ?? new Set<number>();
      sizes.add(c.sizeMm2);
      sizesByWeight.set(c.weightKgPerKm, sizes);
    }
    for (const [weight, sizes] of sizesByWeight) {
      if (sizes.size < REPEATED_WEIGHT_SIZES) continue;
      for (const c of family.filter((x) => x.weightKgPerKm === weight)) {
        c.flags.push(
          flag(
            'weight-implausible',
            'warning',
            `Weight of ${plain(weight)} kg/km is listed for ${sizes.size} different sizes in this product range, so it is probably a drum length and is not used.`,
          ),
        );
        c.weightKgPerKm = null;
      }
    }
  }
}

/** Rows with the same specification but a different OD must be distinguishable in the picker. */
function lookalikeChecks(cables: CatalogCable[]): void {
  for (const group of groupBy(cables, specKey)) {
    const ods = [...new Set(group.map((c) => c.odMm))];
    if (group.length < 2 || ods.length < 2) continue;
    const variantCounts = new Map<string, number>();
    for (const c of group) variantCounts.set(c.variant, (variantCounts.get(c.variant) ?? 0) + 1);
    for (const c of group) {
      const others = group.filter((o) => o !== c).map((o) => num1(o.odMm));
      if (variantCounts.get(c.variant)! > 1) {
        c.variant = `${c.variant} · row ${c.legacyId.replace(/^\D+/, '')}`;
        c.flags.push(flag('lookalike-unresolved', 'warning', `Same specification as other rows with OD ${others.join(', ')} mm, and no product code or page to tell them apart.`));
      } else {
        c.flags.push(flag('lookalike', 'info', `Same specification as other rows with OD ${others.join(', ')} mm; this one is ${c.variant}.`));
      }
    }
  }
}

export function statusFromFlags(flags: readonly CatalogFlag[]): CatalogStatus {
  if (flags.some((f) => f.severity === 'error')) return 'excluded';
  if (flags.some((f) => f.severity === 'warning')) return 'needs-review';
  return 'checked';
}

/**
 * Runs every check and sets each row's flags and status. Rows with errors are
 * left out of the comparisons between rows, so one bad value does not flag
 * its neighbours.
 */
export function runChecks(cables: readonly CatalogCable[]): CatalogCable[] {
  const checked = cables.map(rowChecks);
  const usable = checked.filter((c) => statusFromFlags(c.flags) !== 'excluded');
  orderChecks(usable);
  repeatedWeightChecks(usable);
  lookalikeChecks(usable);
  return checked.map((c) => ({ ...c, status: statusFromFlags(c.flags) }));
}
