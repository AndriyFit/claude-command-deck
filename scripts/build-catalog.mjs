import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_PREFIX = 'https://raw.githubusercontent.com/AndriyFit/claude-command-deck/';

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }

function extractDescription(content, fallback) {
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) {
      for (const line of content.slice(3, end).split('\n')) {
        const m = line.match(/^description:\s*(.*)$/);
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  for (const raw of content.split('\n')) {
    const l = raw.trim();
    if (l && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('---')) return l;
  }
  return fallback;
}

/** Reads a source file: self-hosted raw URLs are read locally from the repo; others are fetched. */
async function readSource(url) {
  if (url.startsWith(SELF_PREFIX)) {
    // strip prefix + the "<ref>/" segment → repo-relative path
    const afterPrefix = url.slice(SELF_PREFIX.length);
    const rest = afterPrefix.slice(afterPrefix.indexOf('/') + 1);
    return readFileSync(join(ROOT, rest), 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

const { sources } = JSON.parse(readFileSync(join(ROOT, 'catalog', 'sources.json'), 'utf8'));
const entries = [];
for (const s of sources) {
  const primary = s.files[0];
  let content = '';
  try { content = await readSource(primary.url); }
  catch (e) { console.error(`SKIP ${s.type}:${s.name}: ${e.message}`); continue; }
  entries.push({
    id: `${s.type}:${s.source}:${s.name}`,
    type: s.type, name: s.name, category: s.category,
    origin: s.origin, source: s.source,
    title: s.title || s.name,
    description: extractDescription(content, s.name),
    version: s.version || '1',
    hash: sha256(content),
    files: s.files,
    ...(s.pluginInstall ? { pluginInstall: s.pluginInstall } : {}),
  });
}
const index = { version: 1, generatedAt: new Date().toISOString(), entries };
writeFileSync(join(ROOT, 'catalog', 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`build-catalog: wrote ${entries.length} entries`);
