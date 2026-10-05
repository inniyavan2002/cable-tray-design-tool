/** Browser-only helpers for turning exports into files. */
import { zipSync } from 'fflate';
import type { SvgDocument } from './drawingSvg';

/** Rasterises an SVG at `scale` × its size. Uses a data URL so the canvas is never tainted, even from file://. */
export function svgToPng(doc: SvgDocument, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(doc.width * scale);
      canvas.height = Math.round(doc.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('This browser cannot draw images.'));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0, doc.width, doc.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The drawing could not be converted to PNG.'))), 'image/png');
    };
    image.onerror = () => reject(new Error('The drawing could not be rendered.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc.svg)}`;
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function zipFiles(files: ReadonlyArray<{ name: string; blob: Blob }>): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.name] = new Uint8Array(await f.blob.arrayBuffer());
  return new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' });
}

/** Starts a download of the blob under the given file name. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
