/**
 * Raw-text tag insertion into YAML frontmatter. Obsidian's
 * `processFrontMatter()` parses and re-serializes the whole block, which
 * corrupts vault-specific YAML such as unquoted wikilinks
 * (`company: [[Acme]]` → nested list) — a recurring incident in this vault.
 * Here only the `tags` key is rewritten; every other frontmatter byte is
 * preserved. Approach shared with exo's `core/frontmatter-patch.ts`.
 */

function frontmatterBounds(content: string): { start: number; end: number } | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return null;
  const match = /\r?\n---(?:\r?\n|$)/g;
  match.lastIndex = content.indexOf('\n') + 1;
  const closing = match.exec(content);
  if (!closing) return null;
  return { start: content.indexOf('\n') + 1, end: closing.index };
}

/** Key of a top-level `key: …` line, or null for blanks/comments/list items. */
function topLevelKey(line: string): string | null {
  if (!line || /^[ \t#-]/.test(line)) return null;
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  return line.slice(0, colon).trim().replace(/^["']|["']$/g, '');
}

function stripQuotes(s: string): string {
  const t = s.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
}

function normalizeTag(s: string): string {
  return stripQuotes(s).replace(/^#/, '');
}

/** Parse the entries of a `tags` block (inline array, single scalar, or list items). */
function parseTags(lines: string[]): string[] {
  const head = lines[0] ?? '';
  const value = head.slice(head.indexOf(':') + 1).trim();
  if (value.startsWith('[')) {
    const inner = value.replace(/^\[|\]$/g, '').trim();
    return inner ? inner.split(',').map(normalizeTag).filter(Boolean) : [];
  }
  if (value) return [normalizeTag(value)];
  return lines
    .slice(1)
    .filter((l) => /^\s*-\s*/.test(l))
    .map((l) => normalizeTag(l.replace(/^\s*-\s*/, '')))
    .filter(Boolean);
}

/**
 * Add `tag` (no leading `#`) to the note's frontmatter `tags`, rewriting only
 * the tags block in list style. Returns the new content, or null when the tag
 * is already present (no write needed).
 */
export function addTagToFrontmatter(content: string, tag: string): string | null {
  const clean = tag.replace(/^#/, '').trim();
  if (!clean) return null;

  const bounds = frontmatterBounds(content);
  if (!bounds) {
    return `---\ntags:\n  - ${clean}\n---\n${content}`;
  }

  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const block = content.slice(bounds.start, bounds.end);
  const lines = block.split(/\r?\n/);
  const start = lines.findIndex((l) => topLevelKey(l) === 'tags');

  if (start < 0) {
    const appended = [...lines, 'tags:', `  - ${clean}`].join(newline);
    return content.slice(0, bounds.start) + appended + content.slice(bounds.end);
  }

  // Continuation lines of the tags block: list items or indented content only —
  // blank lines and comments end the block so they survive the splice.
  let end = start + 1;
  while (end < lines.length) {
    const l = lines[end];
    if (l === undefined || !(/^\s*-\s/.test(l) || /^\s+\S/.test(l))) break;
    end++;
  }
  const existing = parseTags(lines.slice(start, end));
  if (existing.includes(clean)) return null;

  const rebuilt = ['tags:', ...[...existing, clean].map((t) => `  - ${t}`)];
  lines.splice(start, end - start, ...rebuilt);
  return content.slice(0, bounds.start) + lines.join(newline) + content.slice(bounds.end);
}
