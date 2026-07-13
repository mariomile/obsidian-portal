/**
 * Extension → Lucide icon name. Pure (no `obsidian` import) so `node --test`
 * can load it. Every name here was verified to render in Obsidian's Lucide set.
 */
const EXT_ICON: Record<string, string> = {
  // Notes / text / documents
  md: 'file-text',
  markdown: 'file-text',
  txt: 'file-text',
  doc: 'file-text',
  docx: 'file-text',
  rtf: 'file-text',
  pdf: 'file-type',
  ppt: 'presentation',
  pptx: 'presentation',
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  bmp: 'image',
  avif: 'image',
  heic: 'image',
  tiff: 'image',
  tif: 'image',
  ico: 'image',
  // Video
  mp4: 'film',
  mov: 'film',
  webm: 'film',
  mkv: 'film',
  avi: 'film',
  m4v: 'film',
  // Audio
  mp3: 'music',
  wav: 'music',
  flac: 'music',
  ogg: 'music',
  m4a: 'music',
  aac: 'music',
  opus: 'music',
  '3gp': 'music',
  // Obsidian-native
  canvas: 'layout-dashboard',
  base: 'table',
  excalidraw: 'shapes',
  // Code / data
  json: 'file-json',
  js: 'file-code',
  ts: 'file-code',
  jsx: 'file-code',
  tsx: 'file-code',
  css: 'file-code',
  html: 'file-code',
  py: 'file-code',
  sh: 'file-code',
  yml: 'file-code',
  yaml: 'file-code',
  csv: 'file-spreadsheet',
  xls: 'file-spreadsheet',
  xlsx: 'file-spreadsheet',
  // Archives
  zip: 'archive',
  gz: 'archive',
  tar: 'archive',
  rar: 'archive',
  '7z': 'archive',
};

/** Lucide icon for a file extension (case-insensitive); 'file' when unknown. */
export function fileIcon(extension: string): string {
  return EXT_ICON[extension.toLowerCase()] ?? 'file';
}
