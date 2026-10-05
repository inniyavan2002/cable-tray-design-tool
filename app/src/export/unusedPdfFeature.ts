// jsPDF loads html2canvas, DOMPurify and canvg only for doc.html() and SVG
// images, which this app does not use. vite.config.ts points them here to keep
// about 380 KB out of the app; calling one of those features fails clearly.
export default function unavailable(): never {
  throw new Error('This PDF feature is not included in Cable Tray Design.');
}
