import * as fs from 'fs';
import * as path from 'path';
import { CatalogEntry } from './catalogTypes';
import { parseIndex } from './catalog';

const CACHE_NAME = 'catalog-index.json';

export function isHttp(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function localPath(url: string): string {
  return url.startsWith('file://') ? url.slice('file://'.length) : url;
}

/** Reads a file by http(s) URL or local path (file:// or plain path). */
export async function fetchFile(url: string): Promise<string> {
  if (isHttp(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
    return res.text();
  }
  return fs.readFileSync(localPath(url), 'utf8');
}

export function loadIndexCache(cacheDir: string): CatalogEntry[] {
  try {
    return parseIndex(JSON.parse(fs.readFileSync(path.join(cacheDir, CACHE_NAME), 'utf8')));
  } catch {
    return [];
  }
}

export function saveIndexCache(cacheDir: string, entries: CatalogEntry[]): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, CACHE_NAME),
    JSON.stringify({ version: 1, generatedAt: '', entries }, null, 2),
  );
}

/** Fetches and parses the catalog index; on failure falls back to the on-disk cache. */
export async function fetchIndex(url: string, cacheDir: string): Promise<CatalogEntry[]> {
  try {
    const raw = await fetchFile(url);
    const entries = parseIndex(JSON.parse(raw));
    if (entries.length > 0) saveIndexCache(cacheDir, entries);
    return entries;
  } catch {
    return loadIndexCache(cacheDir);
  }
}
