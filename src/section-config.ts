export const PORTAL_SECTION_KEYS = [
  'pinned',
  'bookmarks',
  'recent',
  'folders',
  'tags',
  'collections',
] as const;

export type PortalSectionKey = (typeof PORTAL_SECTION_KEYS)[number];

export const PORTAL_SECTION_LABELS: Record<PortalSectionKey, string> = {
  pinned: 'Pinned',
  bookmarks: 'Bookmarks',
  recent: 'Recent',
  folders: 'Folders',
  tags: 'Tags',
  collections: 'Collections',
};

const isPortalSectionKey = (value: string): value is PortalSectionKey =>
  PORTAL_SECTION_KEYS.some((key) => key === value);

/** Keep persisted order valid, unique, and forward-compatible with new sections. */
export function parseSectionOrder(value: unknown): PortalSectionKey[] {
  const stored = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
  const valid = stored.filter(isPortalSectionKey);
  return [
    ...new Set(valid),
    ...PORTAL_SECTION_KEYS.filter((key) => !valid.includes(key)),
  ];
}

/** Missing setting means migration from v0.1: keep every section visible. */
export function parseEnabledSections(value: unknown): PortalSectionKey[] {
  if (!Array.isArray(value)) return [...PORTAL_SECTION_KEYS];
  const stored = value.filter((item): item is string => typeof item === 'string');
  return [...new Set(stored.filter(isPortalSectionKey))];
}
