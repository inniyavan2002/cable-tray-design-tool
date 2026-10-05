/**
 * Review decisions recorded by people who checked catalog rows against the
 * manufacturer PDFs (src/data/catalog/review.json). Corrections are applied
 * before the automatic checks run; afterwards, a reviewed row's warnings are
 * kept as information and its status becomes "checked". A review can never
 * make a row with an impossible value selectable: that raises an error, which
 * fails the tests and so the CI build.
 */
import { runChecks } from './checks';
import { baseVariant } from './normalize';
import type { CatalogCable } from './types';

export const CORRECTABLE_FIELDS = [
  'odMm',
  'weightKgPerKm',
  'sizeMm2',
  'neutralSizeMm2',
  'cores',
  'conductor',
  'insulation',
  'armour',
  'voltage',
  'standard',
  'code',
] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export interface ReviewDecision {
  id: string;
  /** correct: fix values; accept: the row is right as it is; exclude: hide it from cable selection. */
  action: 'correct' | 'accept' | 'exclude';
  /** For "correct": the corrected values. */
  set?: Partial<Pick<CatalogCable, CorrectableField>>;
  note: string;
  by: string;
  /** YYYY-MM-DD */
  date: string;
}

export class CatalogReviewError extends Error {
  override name = 'CatalogReviewError';
}

export function validateDecisions(decisions: readonly ReviewDecision[], knownIds: ReadonlySet<string>): void {
  const seen = new Set<string>();
  for (const d of decisions) {
    const where = `Review decision for "${d.id}"`;
    if (!knownIds.has(d.id)) throw new CatalogReviewError(`${where}: no catalog row has this id.`);
    if (seen.has(d.id)) throw new CatalogReviewError(`${where}: the row has more than one decision.`);
    seen.add(d.id);
    if (!['correct', 'accept', 'exclude'].includes(d.action)) {
      throw new CatalogReviewError(`${where}: action must be correct, accept or exclude.`);
    }
    if (!d.note?.trim() || !d.by?.trim()) throw new CatalogReviewError(`${where}: a note and a reviewer name are required.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? '')) throw new CatalogReviewError(`${where}: date must be YYYY-MM-DD.`);
    if (d.action === 'correct') {
      const fields = Object.keys(d.set ?? {});
      if (!fields.length) throw new CatalogReviewError(`${where}: a correction needs at least one corrected value.`);
      const unknown = fields.filter((f) => !(CORRECTABLE_FIELDS as readonly string[]).includes(f));
      if (unknown.length) throw new CatalogReviewError(`${where}: these fields cannot be corrected: ${unknown.join(', ')}.`);
    } else if (d.set) {
      throw new CatalogReviewError(`${where}: corrected values are only allowed with action "correct".`);
    }
  }
}

/** Applies corrections, runs the automatic checks, then records each review on its row. */
export function applyReview(normalized: readonly CatalogCable[], decisions: readonly ReviewDecision[]): CatalogCable[] {
  validateDecisions(decisions, new Set(normalized.map((c) => c.id)));
  const byId = new Map(decisions.map((d) => [d.id, d]));

  const corrected = normalized.map((c) => {
    const d = byId.get(c.id);
    if (d?.action !== 'correct') return c;
    const merged = { ...c, ...d.set };
    return { ...merged, variant: baseVariant(merged) };
  });

  return runChecks(corrected).map((c) => {
    const d = byId.get(c.id);
    if (!d) return c;
    const review = { action: d.action, note: d.note, by: d.by, date: d.date };
    if (d.action === 'exclude') {
      return {
        ...c,
        status: 'excluded' as const,
        review,
        flags: [...c.flags, { code: 'excluded-by-review' as const, severity: 'error' as const, message: `Excluded after review: ${d.note}` }],
      };
    }
    const errors = c.flags.filter((f) => f.severity === 'error');
    if (errors.length) {
      throw new CatalogReviewError(
        `Review decision for "${c.id}" (${d.action}) leaves an impossible value: ${errors[0]!.message} Correct the value or exclude the row.`,
      );
    }
    // A person has checked the row: remaining warnings stay visible as information.
    const flags = c.flags.map((f) => (f.severity === 'warning' ? { ...f, severity: 'info' as const } : f));
    return { ...c, flags, status: 'checked' as const, review };
  });
}
