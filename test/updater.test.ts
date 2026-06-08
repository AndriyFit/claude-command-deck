import { describe, it, expect } from 'vitest';
import { isNewer } from '../src/semver';

describe('isNewer', () => {
  it('detects a higher patch', () => {
    expect(isNewer('0.2.1', '0.2.0')).toBe(true);
  });
  it('detects a higher minor', () => {
    expect(isNewer('0.3.0', '0.2.9')).toBe(true);
  });
  it('detects a higher major', () => {
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
  });
  it('returns false for equal versions', () => {
    expect(isNewer('0.2.0', '0.2.0')).toBe(false);
  });
  it('returns false for older versions', () => {
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
  });
  it('handles differing segment counts', () => {
    expect(isNewer('0.2', '0.2.0')).toBe(false);
    expect(isNewer('0.2.0.1', '0.2.0')).toBe(true);
  });
});
