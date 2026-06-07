import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  extractDescriptionField,
  firstParagraph,
  extractDescription,
  hashString,
} from '../src/scanner';

describe('parseFrontmatter', () => {
  it('splits frontmatter and body', () => {
    const { frontmatter, body } = parseFrontmatter('---\nname: a\ndescription: D\n---\n# Title\ntext');
    expect(frontmatter).toContain('description: D');
    expect(body).toContain('# Title');
  });
  it('returns null frontmatter when none', () => {
    const { frontmatter, body } = parseFrontmatter('# Title\ntext');
    expect(frontmatter).toBeNull();
    expect(body).toContain('# Title');
  });
});

describe('extractDescriptionField', () => {
  it('reads description value', () => {
    expect(extractDescriptionField('name: a\ndescription: Does X')).toBe('Does X');
  });
  it('strips quotes', () => {
    expect(extractDescriptionField('description: "Quoted"')).toBe('Quoted');
  });
  it('returns null when absent', () => {
    expect(extractDescriptionField('name: a')).toBeNull();
  });
});

describe('firstParagraph', () => {
  it('skips headings and blockquotes', () => {
    expect(firstParagraph('# Heading\n\n> meta\n\nReal line\nmore')).toBe('Real line');
  });
});

describe('extractDescription', () => {
  it('prefers frontmatter description', () => {
    expect(extractDescription('---\ndescription: FM\n---\n# H\npara')).toBe('FM');
  });
  it('falls back to first paragraph without frontmatter', () => {
    expect(extractDescription('# Code Review\n\nComprehensive review of changes')).toBe('Comprehensive review of changes');
  });
});

describe('hashString', () => {
  it('is stable and 12 chars', () => {
    const h = hashString('abc');
    expect(h).toBe(hashString('abc'));
    expect(h).toHaveLength(12);
  });
});
