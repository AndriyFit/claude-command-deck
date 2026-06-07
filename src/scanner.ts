import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CommandItem, ItemType } from './types';

export function parseFrontmatter(content: string): { frontmatter: string | null; body: string } {
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content };
  }
  const end = content.indexOf('\n---', 3);
  if (end === -1) {
    return { frontmatter: null, body: content };
  }
  const frontmatter = content.slice(3, end).trim();
  const body = content.slice(end + 4).trim();
  return { frontmatter, body };
}

export function extractDescriptionField(frontmatter: string): string | null {
  for (const line of frontmatter.split('\n')) {
    const m = line.match(/^description:\s*(.*)$/);
    if (m) {
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return null;
}

export function firstParagraph(body: string): string {
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('>')) continue;
    return line;
  }
  return '';
}

export function extractDescription(content: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  if (frontmatter) {
    const d = extractDescriptionField(frontmatter);
    if (d) return d;
  }
  return firstParagraph(body);
}

export function hashString(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}
