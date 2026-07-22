import type { App } from 'obsidian';
import { getPlugin } from '../obsidian-internals';

interface KeywordHit {
  path: string;
  basename: string;
}
interface SearchService {
  query(raw: string, opts: { limit?: number }): Promise<KeywordHit[]>;
}
interface SonarPlugin {
  service?: SearchService;
}

export interface JumpHit {
  path: string;
  basename: string;
  /** Sonar only indexes notes, so every hit it returns is a file. Folder
   *  hits are added separately in `jump.ts` (Sonar isn't folder-aware). */
  isFolder: boolean;
}

const SONAR_ID = 'sonar';

export function isSonarPresent(app: App): boolean {
  return Boolean(getPlugin<SonarPlugin>(app, SONAR_ID)?.service);
}

/** Ranked jump results via sonar's in-process BM25 service ([] on failure). */
export async function sonarQuery(app: App, raw: string, limit = 20): Promise<JumpHit[]> {
  const service = getPlugin<SonarPlugin>(app, SONAR_ID)?.service;
  if (!service) return [];
  try {
    const hits = await service.query(raw, { limit });
    return hits.map((h) => ({ path: h.path, basename: h.basename, isFolder: false }));
  } catch {
    return [];
  }
}
