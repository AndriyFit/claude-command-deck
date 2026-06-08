import { CatalogEntry } from './catalogTypes';

function isEntry(x: unknown): x is CatalogEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    (e.type === 'command' || e.type === 'skill' || e.type === 'plugin') &&
    typeof e.name === 'string' &&
    typeof e.category === 'string' &&
    (e.origin === 'official' || e.origin === 'custom') &&
    typeof e.title === 'string' &&
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
