import type { App } from 'obsidian';

interface TaggedFile {
  path: string;
  basename: string;
}

/** Files carrying `fullTag` exactly (inline tags + frontmatter `tags`). */
export function filesForTag(app: App, fullTag: string, limit = 100): TaggedFile[] {
  const target = fullTag.replace(/^#/, '');
  const out: TaggedFile[] = [];
  const cap = Math.max(1, Math.min(limit, 500));

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache) continue;

    const tags = new Set<string>();
    for (const entry of cache.tags ?? []) tags.add(entry.tag.replace(/^#/, ''));
    const fmTags = cache.frontmatter?.tags;
    if (typeof fmTags === 'string') {
      tags.add(fmTags.replace(/^#/, ''));
    } else if (Array.isArray(fmTags)) {
      for (const t of fmTags) if (typeof t === 'string') tags.add(t.replace(/^#/, ''));
    }

    if (tags.has(target)) {
      out.push({ path: file.path, basename: file.basename });
      if (out.length >= cap) break;
    }
  }

  out.sort((a, b) =>
    a.basename.localeCompare(b.basename, undefined, { sensitivity: 'base' }),
  );
  return out;
}
