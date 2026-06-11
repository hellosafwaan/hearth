import { describe, expect, it } from 'vitest';
import { normalizeSite } from '../../../src/lib/sites';

describe('normalizeSite', () => {
  it.each([
    ['https://www.YouTube.com/watch?v=1', 'youtube.com'],
    ['www.youtube.com', 'youtube.com'],
    ['youtube.com', 'youtube.com'],
    ['http://localhost:1234/v1', 'localhost'],
    ['sub.example.co.uk', 'sub.example.co.uk'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizeSite(input)).toBe(expected);
  });

  it('returns null for empty or unparsable values', () => {
    expect(normalizeSite('')).toBeNull();
    expect(normalizeSite('   ')).toBeNull();
    expect(normalizeSite('ht tp://nope')).toBeNull();
  });
});
