/** A row exactly as it was stored in tool.html's MASTER_CATALOG. */
export interface LegacyCatalogRow {
  id: string;
  brand: string;
  category: string;
  standard: string;
  voltage: string;
  conductor: string;
  insulation: string;
  shield?: string;
  armour: string;
  coreConfig: string;
  size: string;
  unit: string;
  phaseSize: string;
  neutralSize: string;
  form: string;
  wires: string;
  insulationThickness: string;
  sheathThickness: string;
  armourThickness?: string;
  armourWireDiameter?: string;
  outerSheathThickness?: string;
  od: number;
  weight: number;
  code: string;
  drum: string;
  sourcePage: number | string;
  raw: string | string[];
  sourceConfidence?: string;
}

export type Conductor = 'Cu' | 'Al';
export type Insulation = 'PVC' | 'XLPE';
export type Armour = 'Unarmoured' | 'SWA' | 'STA' | 'AWA';

/**
 * checked: passed every automatic check (not the same as checked by a person;
 *   see `review` for that).
 * needs-review: selectable, but shown with a warning until someone checks it.
 * excluded: has an impossible value; hidden from cable selection.
 */
export type CatalogStatus = 'checked' | 'needs-review' | 'excluded';

export type FlagSeverity = 'error' | 'warning' | 'info';

export type FlagCode =
  | 'od-impossible'
  | 'od-unusual'
  | 'od-order'
  | 'size-nonstandard'
  | 'cores-unknown'
  | 'conductor-missing'
  | 'weight-implausible'
  | 'conductor-suspect'
  | 'lookalike'
  | 'lookalike-unresolved'
  | 'excluded-by-review';

export interface CatalogFlag {
  code: FlagCode;
  severity: FlagSeverity;
  /** Plain-language explanation for reviewers and the cable picker. */
  message: string;
}

export interface CatalogReviewNote {
  action: 'correct' | 'accept' | 'exclude';
  note: string;
  by: string;
  date: string;
}

export interface CatalogCable {
  /** Stable id used by saved projects, e.g. "doha-1234". */
  id: string;
  /** Id in the old tool, e.g. "mdb_1234"; used to import old saved trays. */
  legacyId: string;
  brandId: string;
  brand: string;
  category: string;
  standard: string | null;
  voltage: string | null;
  conductor: Conductor | null;
  insulation: Insulation | null;
  armour: Armour | null;
  screen: string | null;
  /** Number of cores, or null when the catalogue only says "multi core". */
  cores: number | null;
  reducedNeutral: boolean;
  sizeMm2: number;
  neutralSizeMm2: number | null;
  /** Conductor shape code from the catalogue, e.g. "rm", "sm". */
  conductorShape: string | null;
  odMm: number;
  /** Null when the catalogue value is missing or impossible. */
  weightKgPerKm: number | null;
  code: string | null;
  /** Tells apart rows that otherwise look the same: the product code, else the catalogue page. */
  variant: string;
  /** Other catalogue columns, shown in the catalog browser. */
  details: Record<string, string>;
  source: { file: string; page: number | null; raw: string };
  status: CatalogStatus;
  flags: CatalogFlag[];
  review: CatalogReviewNote | null;
}

export interface CatalogBrand {
  id: string;
  name: string;
  /** Brand name as written in the old tool's data. */
  legacyName: string;
  /** File name inside the pdfs/ folder. */
  pdfFile: string;
  pdfPages: number;
}
