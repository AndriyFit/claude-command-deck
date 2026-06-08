import { CatalogEntry, CatalogRow, InstallState } from './catalogTypes';

function isEntry(x: unknown): x is CatalogEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    (e.type === 'command' || e.type === 'skill' || e.type === 'plugin') &&
    typeof e.name === 'string' &&
    typeof e.category === 'string' &&
    (e.origin === 'official' || e.origin === 'custom') &&
    typeof e.source === 'string' &&
    typeof e.title === 'string' &&
    typeof e.description === 'string' &&
    typeof e.version === 'string' &&
    typeof e.hash === 'string' &&
    Array.isArray(e.files)
  );
}

export function parseIndex(json: unknown): CatalogEntry[] {
  if (!json || typeof json !== 'object') return [];
  const entries = (json as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter(isEntry);
}

export function installedKey(type: string, name: string): string {
  return `${type}:${name}`;
}

export function computeStatus(
  entries: CatalogEntry[],
  installed: Map<string, string>,
): CatalogRow[] {
  return entries.map(entry => {
    let state: InstallState = 'not_installed';
    if (entry.type !== 'plugin') {
      const have = installed.get(installedKey(entry.type, entry.name));
      if (have !== undefined) state = have === entry.hash ? 'installed' : 'update_available';
    }
    return { entry, state };
  });
}
