import type { CatalogBrand } from './types';

/** The nine manufacturers, with the catalogue PDF kept in the pdfs/ folder. */
export const BRANDS: readonly CatalogBrand[] = [
  { id: 'alfanar', name: 'alfanar', legacyName: 'alfanar', pdfFile: 'Alfanar cables.pdf', pdfPages: 116 },
  { id: 'bahra', name: 'Bahra Electric', legacyName: 'Bahra', pdfFile: 'Bahra electric cables.pdf', pdfPages: 92 },
  { id: 'doha', name: 'Doha Cables', legacyName: 'Doha Cables', pdfFile: 'Doha Cables.pdf', pdfPages: 174 },
  { id: 'ducab', name: 'Ducab', legacyName: 'Ducab', pdfFile: 'Ducab cables.pdf', pdfPages: 44 },
  { id: 'jeddah', name: 'Jeddah Cable Company', legacyName: 'Jeddah Cable Company', pdfFile: 'Jeddah cables.pdf', pdfPages: 35 },
  { id: 'oman', name: 'Oman Cables', legacyName: 'Oman Cables', pdfFile: 'Oman Cables.pdf', pdfPages: 183 },
  { id: 'ramcro', name: 'RAMCRO', legacyName: 'RAMCRO', pdfFile: 'Ramco cables.pdf', pdfPages: 90 },
  { id: 'riyadh', name: 'Riyadh Cables', legacyName: 'Riyadh Cables', pdfFile: 'Riyadh cables.pdf', pdfPages: 31 },
  { id: 'saudi', name: 'Saudi Cable Company', legacyName: 'Saudi Cable Company', pdfFile: 'Saudi cables.pdf', pdfPages: 93 },
];

export function brandByLegacyName(legacyName: string): CatalogBrand {
  const brand = BRANDS.find((b) => b.legacyName === legacyName);
  if (!brand) throw new Error(`Unknown catalog brand "${legacyName}"`);
  return brand;
}
