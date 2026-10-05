/** Turns a project or tray name into part of a file name: letters, digits, underscores, dots and dashes only. */
export function fileSafe(text: string, fallback = 'tray'): string {
  return text.trim().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || fallback;
}
