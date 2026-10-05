/**
 * Decides how many cables of each size go in each layer.
 *
 * Cables of the same OD are interchangeable, so the search works on counts per
 * OD group rather than on individual cables. Small problems are searched
 * exhaustively. Larger ones start from several different layouts and improve
 * each by moving and swapping cables between layers until nothing helps.
 * The caller supplies the scoring rule, so the search always optimises exactly
 * what the sizing rules select on. The search is deterministic: the same input
 * always gives the same layout.
 */

export interface OdGroup {
  odMm: number;
  count: number;
}

export interface LayerStats {
  count: number;
  sumOdMm: number;
  maxOdMm: number;
  minOdMm: number;
}

/** Compared element by element; lower is better. */
export type LayoutKey = readonly number[];

export interface LayoutObjective {
  score(layers: readonly LayerStats[]): LayoutKey;
  /** Width of one layer, used to find the widest layer when choosing moves. */
  layerWidth(layer: LayerStats): number;
}

/** assignment[layer][group] = number of cables of that group in that layer. */
export type Assignment = number[][];

export interface ArrangeOptions {
  /** Use the exhaustive search when the number of layouts is at most this. */
  exactLimit?: number;
  /** Most layouts the heuristic may score; defaults to MAX_EVALUATIONS. */
  maxEvaluations?: number;
  /** Force one search method; used by tests to compare them. */
  method?: 'auto' | 'exact' | 'heuristic';
}

/** About 4 ms of exhaustive search on a laptop. */
export const DEFAULT_EXACT_LIMIT = 20_000;
/** Most layouts the heuristic scores for one tray; keeps large trays fast. */
const MAX_EVALUATIONS = 20_000;
/** Most "capped" starting layouts; above this, caps are sampled evenly. */
const MAX_CAPPED_STARTS = 24;
const MAX_PASSES = 400;
const KEY_EPSILON = 1e-9;

export function compareKeys(a: LayoutKey, b: LayoutKey): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = a[i]! - b[i]!;
    if (Math.abs(diff) > KEY_EPSILON) return diff;
  }
  return a.length - b.length;
}

/**
 * @param groups OD groups sorted from largest OD to smallest, each OD once.
 * @param layerCount Layers to fill. Every layer receives at least one cable,
 *   so it must not exceed the total number of cables.
 */
export function arrangeLayers(
  groups: readonly OdGroup[],
  layerCount: number,
  objective: LayoutObjective,
  options: ArrangeOptions = {},
): Assignment {
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  if (layerCount < 1 || layerCount > total) {
    throw new RangeError(`Cannot fill ${layerCount} layers with ${total} cables`);
  }
  if (layerCount === 1) return [groups.map((g) => g.count)];

  const method = options.method ?? 'auto';
  const useExact =
    method === 'exact' ||
    (method === 'auto' && layoutCount(groups, layerCount) <= (options.exactLimit ?? DEFAULT_EXACT_LIMIT));
  return useExact
    ? exactSearch(groups, layerCount, objective)
    : heuristicSearch(groups, layerCount, objective, options.maxEvaluations ?? MAX_EVALUATIONS);
}

/** Upper bound on the number of layouts: ways to split each group's count across the layers. */
export function layoutCount(groups: readonly OdGroup[], layerCount: number): number {
  let product = 1;
  for (const g of groups) {
    product *= binomial(g.count + layerCount - 1, layerCount - 1);
    if (product > Number.MAX_SAFE_INTEGER) return Infinity;
  }
  return product;
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

export function statsFor(groups: readonly OdGroup[], layerCounts: readonly number[]): LayerStats {
  let count = 0;
  let sumOdMm = 0;
  let maxOdMm = 0;
  let minOdMm = 0;
  for (let g = 0; g < groups.length; g++) {
    const n = layerCounts[g]!;
    if (n === 0) continue;
    const od = groups[g]!.odMm;
    if (count === 0) maxOdMm = od;
    minOdMm = od;
    count += n;
    sumOdMm += n * od;
  }
  return { count, sumOdMm, maxOdMm, minOdMm };
}

function emptyAssignment(layerCount: number, groupCount: number): Assignment {
  return Array.from({ length: layerCount }, () => new Array<number>(groupCount).fill(0));
}

// ---------------------------------------------------------------------------
// Exhaustive search
// ---------------------------------------------------------------------------

function exactSearch(groups: readonly OdGroup[], layerCount: number, objective: LayoutObjective): Assignment {
  const assignment = emptyAssignment(layerCount, groups.length);
  const stats: LayerStats[] = Array.from({ length: layerCount }, () => ({ count: 0, sumOdMm: 0, maxOdMm: 0, minOdMm: 0 }));
  let best: Assignment | null = null;
  let bestKey: LayoutKey | null = null;

  // Groups are placed largest OD first, so a layer's first group sets its
  // maximum and each later group becomes its minimum.
  const placeGroup = (g: number): void => {
    if (g === groups.length) {
      if (stats.some((s) => s.count === 0)) return;
      const key = objective.score(stats);
      if (!bestKey || compareKeys(key, bestKey) < 0) {
        bestKey = key;
        best = assignment.map((row) => row.slice());
      }
      return;
    }
    const group = groups[g]!;
    const split = (layer: number, remaining: number): void => {
      if (layer === layerCount - 1) {
        addToLayer(layer, g, group, remaining, () => placeGroup(g + 1));
        return;
      }
      for (let n = remaining; n >= 0; n--) {
        addToLayer(layer, g, group, n, () => split(layer + 1, remaining - n));
      }
    };
    split(0, group.count);
  };

  const addToLayer = (layer: number, g: number, group: OdGroup, n: number, next: () => void): void => {
    if (n === 0) {
      next();
      return;
    }
    const s = stats[layer]!;
    // Layers are interchangeable: only start a layer once the previous one has cables.
    if (s.count === 0 && layer > 0 && stats[layer - 1]!.count === 0) return;
    const saved = { ...s };
    if (s.count === 0) s.maxOdMm = group.odMm;
    s.minOdMm = group.odMm;
    s.count += n;
    s.sumOdMm += n * group.odMm;
    assignment[layer]![g] = n;
    next();
    assignment[layer]![g] = 0;
    stats[layer] = saved;
  };

  placeGroup(0);
  if (!best) throw new Error('No layout found');
  return best;
}

// ---------------------------------------------------------------------------
// Heuristic search
// ---------------------------------------------------------------------------

interface Budget {
  evaluations: number;
}

function heuristicSearch(
  groups: readonly OdGroup[],
  layerCount: number,
  objective: LayoutObjective,
  maxEvaluations: number,
): Assignment {
  const budget: Budget = { evaluations: maxEvaluations };
  let best: Assignment | null = null;
  let bestKey: LayoutKey | null = null;
  const consider = (layout: Assignment) => {
    const key = objective.score(layout.map((row) => statsFor(groups, row)));
    if (!bestKey || compareKeys(key, bestKey) < 0) {
      best = layout;
      bestKey = key;
    }
  };

  for (const start of startingLayouts(groups, layerCount)) {
    if (budget.evaluations <= 0) {
      consider(start);
      continue;
    }
    // Taking the best move each time can jump into a layout that ties on tray
    // area but blocks further progress; taking the first small improvement
    // explores differently. Run both and keep the better result.
    for (const mode of ['best', 'first'] as const) {
      consider(improve(groups, start, objective, mode, budget));
    }
  }
  return best!;
}

/** Cables largest first, one entry per cable, as group indexes. */
function unitsLargestFirst(groups: readonly OdGroup[]): number[] {
  const units: number[] = [];
  groups.forEach((g, index) => {
    for (let i = 0; i < g.count; i++) units.push(index);
  });
  return units;
}

function startingLayouts(groups: readonly OdGroup[], layerCount: number): Assignment[] {
  const units = unitsLargestFirst(groups);
  const total = units.length;
  const totalOd = units.reduce((sum, g) => sum + groups[g]!.odMm, 0);

  // 1. Low stack: everything on the bottom layer except the smallest cables,
  //    one on each upper layer. Good when height is the tight dimension.
  const lowStack = emptyAssignment(layerCount, groups.length);
  units.forEach((g, i) => {
    const fromEnd = total - 1 - i;
    const layer = fromEnd < layerCount - 1 ? layerCount - 1 - fromEnd : 0;
    lowStack[layer]![g]! += 1;
  });

  // 2. Sorted bands: cables in size order cut into layers of equal width,
  //    so small cables share the upper layers.
  const bands = emptyAssignment(layerCount, groups.length);
  let layer = 0;
  let running = 0;
  units.forEach((g, i) => {
    const remainingLayers = layerCount - layer;
    const remainingUnits = total - i;
    const shouldAdvance =
      layer < layerCount - 1 &&
      running > 0 &&
      (running >= ((layer + 1) * totalOd) / layerCount || remainingUnits < remainingLayers);
    if (shouldAdvance) layer += 1;
    bands[layer]![g]! += 1;
    running += groups[g]!.odMm;
  });

  // 3. Capped and balanced: the tray height depends mostly on the largest
  //    cable allowed in each upper layer. For each such cap, spread the cables
  //    so the layers are about equally wide. Caps of 0 give a plain balance.
  const capped = upperLayerCaps(groups.length, layerCount).map((caps) => cappedBalanced(groups, units, caps));

  return [lowStack, bands, ...capped];
}

/**
 * Cap combinations for the upper layers, as the index of the largest group
 * each may hold (groups are sorted largest first). The bottom layer is never
 * capped. Layer 3's cap is never larger than layer 2's, since the two are
 * interchangeable.
 */
function upperLayerCaps(groupCount: number, layerCount: number): number[][] {
  const combinations = (m: number) => (layerCount === 2 ? m : (m * (m + 1)) / 2);
  let m = groupCount;
  while (m > 1 && combinations(m) > MAX_CAPPED_STARTS) m--;
  const indexes = [...new Set(Array.from({ length: m }, (_, i) => Math.round((i * (groupCount - 1)) / Math.max(1, m - 1))))];
  if (layerCount === 2) return indexes.map((c) => [0, c]);
  return indexes.flatMap((c2) => indexes.filter((c3) => c3 >= c2).map((c3) => [0, c2, c3]));
}

/** Largest cables first, each to the narrowest layer that its cap allows. */
function cappedBalanced(groups: readonly OdGroup[], units: readonly number[], caps: readonly number[]): Assignment {
  const layerCount = caps.length;
  const assignment = emptyAssignment(layerCount, groups.length);
  const sums = new Array<number>(layerCount).fill(0);
  for (const g of units) {
    let target = 0;
    for (let l = 1; l < layerCount; l++) {
      if (g >= caps[l]! && sums[l]! < sums[target]!) target = l;
    }
    assignment[target]![g]! += 1;
    sums[target]! += groups[g]!.odMm;
  }
  // Every layer needs a cable: give each empty layer the smallest cable from
  // the fullest layer.
  for (let l = 0; l < layerCount; l++) {
    if (assignment[l]!.some((n) => n > 0)) continue;
    const donor = sums.indexOf(Math.max(...sums));
    const g = assignment[donor]!.findLastIndex((n) => n > 0);
    assignment[donor]![g]! -= 1;
    assignment[l]![g]! += 1;
    sums[donor]! -= groups[g]!.odMm;
    sums[l]! += groups[g]!.odMm;
  }
  return assignment;
}

/** One change to a layout: [group, count change, layer]. */
type Change = readonly [group: number, delta: number, layer: number];

interface Move {
  from: number;
  to: number;
  changes: readonly Change[];
}

/**
 * Candidate moves that could shrink the tray. The width only falls when a
 * cable leaves the widest layer, and the height only falls when a layer's
 * largest cable leaves it, so only those moves are tried: shifting 1, 2, 4 …
 * cables of one size to another layer, or swapping one for a smaller cable.
 * With smallFirst, the smallest cables are tried first, so the first improving
 * move is also the gentlest.
 */
function* candidateMoves(current: Assignment, stats: readonly LayerStats[], groups: readonly OdGroup[], widest: readonly boolean[], smallFirst: boolean): Generator<Move> {
  const layerCount = current.length;
  const groupCount = groups.length;
  const order = Array.from({ length: groupCount }, (_, i) => (smallFirst ? groupCount - 1 - i : i));
  const useful = (from: number, g: number) => widest[from]! || groups[g]!.odMm === stats[from]!.maxOdMm;

  for (const g of order) {
    for (let from = 0; from < layerCount; from++) {
      if (current[from]![g]! === 0 || !useful(from, g)) continue;
      for (let to = 0; to < layerCount; to++) {
        if (from === to) continue;
        for (let n = 1; n <= current[from]![g]!; n *= 2) {
          yield { from, to, changes: [[g, -n, from], [g, n, to]] };
        }
      }
    }
  }
  for (const g of order) {
    for (let from = 0; from < layerCount; from++) {
      if (current[from]![g]! === 0 || !useful(from, g)) continue;
      for (let to = 0; to < layerCount; to++) {
        if (from === to) continue;
        for (let h = g + 1; h < groupCount; h++) {
          if (current[to]![h]! === 0) continue;
          yield { from, to, changes: [[g, -1, from], [g, 1, to], [h, -1, to], [h, 1, from]] };
        }
      }
    }
  }
}

/**
 * Stats for one layer after its counts changed, without rescanning unless a
 * group that set the layer's largest or smallest OD has left it.
 */
function updatedStats(before: LayerStats, counts: readonly number[], groups: readonly OdGroup[], changes: readonly Change[], layer: number): LayerStats {
  let { count, sumOdMm, maxOdMm, minOdMm } = before;
  let rescan = false;
  for (const [g, delta, l] of changes) {
    if (l !== layer) continue;
    const od = groups[g]!.odMm;
    if (delta > 0) {
      if (count === 0) {
        maxOdMm = od;
        minOdMm = od;
      } else {
        maxOdMm = Math.max(maxOdMm, od);
        minOdMm = Math.min(minOdMm, od);
      }
    } else if (counts[g] === 0 && (od === maxOdMm || od === minOdMm)) {
      rescan = true;
    }
    count += delta;
    sumOdMm += delta * od;
  }
  return rescan ? statsFor(groups, counts) : { count, sumOdMm, maxOdMm, minOdMm };
}

function applyChanges(current: Assignment, changes: readonly Change[], sign: 1 | -1): void {
  for (const [g, delta, layer] of changes) current[layer]![g]! += sign * delta;
}

/**
 * Moves and swaps cables between layers while that lowers the score.
 * "best" applies the most improving move each pass; "first" applies the first
 * improving move found, trying the smallest cables first.
 */
function improve(
  groups: readonly OdGroup[],
  start: Assignment,
  objective: LayoutObjective,
  mode: 'best' | 'first',
  budget: Budget,
): Assignment {
  const current = start.map((row) => row.slice());
  let stats = current.map((row) => statsFor(groups, row));
  let currentKey = objective.score(stats);

  for (let pass = 0; pass < MAX_PASSES && budget.evaluations > 0; pass++) {
    const widths = stats.map((s) => objective.layerWidth(s));
    const maxWidth = Math.max(...widths);
    const widest = widths.map((w) => w >= maxWidth - KEY_EPSILON);

    let chosen: Move | null = null;
    let chosenKey = currentKey;
    for (const move of candidateMoves(current, stats, groups, widest, mode === 'first')) {
      applyChanges(current, move.changes, 1);
      const fromStats = updatedStats(stats[move.from]!, current[move.from]!, groups, move.changes, move.from);
      const toStats = updatedStats(stats[move.to]!, current[move.to]!, groups, move.changes, move.to);
      applyChanges(current, move.changes, -1);
      if (fromStats.count === 0 || toStats.count === 0) continue;
      const trial = stats.slice();
      trial[move.from] = fromStats;
      trial[move.to] = toStats;
      budget.evaluations -= 1;
      const key = objective.score(trial);
      if (compareKeys(key, chosenKey) < 0) {
        chosen = move;
        chosenKey = key;
        if (mode === 'first') break;
      }
      if (budget.evaluations <= 0) break;
    }
    if (!chosen) break;
    applyChanges(current, chosen.changes, 1);
    stats = current.map((row) => statsFor(groups, row));
    currentKey = objective.score(stats);
  }
  return current;
}
