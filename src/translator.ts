import * as fs from 'fs';
import * as path from 'path';
import { CommandItem } from './types';

type CacheEntry = { hash: string; text: string };
type Cache = Record<string, CacheEntry>;

export interface TranslateDeps {
  getKey: () => Promise<string>;
  fetchTranslations: (
    key: string,
    model: string,
    lang: string,
    items: { id: string; text: string }[],
  ) => Promise<Record<string, string>>;
  cacheDir: string;
  model: string;
}

export function cacheFile(cacheDir: string, lang: string): string {
  return path.join(cacheDir, `translations.${lang}.json`);
}

export function loadCache(cacheDir: string, lang: string): Cache {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(cacheDir, lang), 'utf8')) as Cache;
  } catch {
    return {};
  }
}

export function saveCache(cacheDir: string, lang: string, cache: Cache): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile(cacheDir, lang), JSON.stringify(cache, null, 2));
}

export async function translate(
  items: CommandItem[],
  lang: string,
  deps: TranslateDeps,
): Promise<Map<string, string>> {
  const cache = loadCache(deps.cacheDir, lang);
  const missing = items.filter(it => cache[it.id]?.hash !== it.contentHash);

  if (missing.length > 0) {
    try {
      const key = await deps.getKey();
      const translated = await deps.fetchTranslations(
        key,
        deps.model,
        lang,
        missing.map(it => ({ id: it.id, text: it.rawDescription })),
      );
      for (const it of missing) {
        const t = translated[it.id];
        if (t) cache[it.id] = { hash: it.contentHash, text: t };
      }
      saveCache(deps.cacheDir, lang, cache);
    } catch {
      // network/key failure → silently fall back to raw descriptions below
    }
  }

  const result = new Map<string, string>();
  for (const it of items) {
    result.set(it.id, cache[it.id]?.text ?? it.rawDescription);
  }
  return result;
}
