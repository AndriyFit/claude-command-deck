import { describe, it, expect } from 'vitest';
import { chunk } from '../src/openrouter';

describe('chunk', () => {
  it('splits into fixed-size groups', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns empty for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});
