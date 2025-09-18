import { describe, it, expect } from 'vitest';
import { parseKey, parseTimestamp, formatDuration, formatBytes } from './utils';

describe('CRDB Utils', () => {
  describe('parseKey', () => {
    const testCases = [
      { input: '/Table/1', expected: { type: 'Table', id: '1', raw: '/Table/1' } },
      { input: '/System/NodeLiveness', expected: { type: 'System', detail: 'NodeLiveness', raw: '/System/NodeLiveness' } },
      { input: '/Local/Range/1', expected: { type: 'Local', detail: 'Range/1', raw: '/Local/Range/1' } },
      { input: 'invalid', expected: { type: 'Unknown', raw: 'invalid' } },
      { input: '', expected: { type: 'Unknown', raw: '' } },
      { input: null, expected: { type: 'Unknown', raw: 'null' } }
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should parse "${input}" correctly`, () => {
        expect(parseKey(input as any)).toEqual(expected);
      });
    });
  });

  describe('parseTimestamp', () => {
    const testCases = [
      { input: '1704067200000000000', expected: new Date('2024-01-01T00:00:00Z') },
      { input: '1704067200.000000000', expected: new Date('2024-01-01T00:00:00Z') },
      { input: '2024-01-01T00:00:00Z', expected: new Date('2024-01-01T00:00:00Z') },
      { input: 1704067200000, expected: new Date('2024-01-01T00:00:00Z') },
      { input: 'invalid', expected: null },
      { input: null, expected: null },
      { input: undefined, expected: null }
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should parse timestamp "${input}" correctly`, () => {
        const result = parseTimestamp(input as any);
        if (expected === null) {
          expect(result).toBeNull();
        } else {
          expect(result?.getTime()).toBe(expected.getTime());
        }
      });
    });
  });

  describe('formatDuration', () => {
    const testCases = [
      { input: 0, expected: '0ms' },
      { input: 500, expected: '500ms' },
      { input: 1000, expected: '1.0s' },
      { input: 1500, expected: '1.5s' },
      { input: 60000, expected: '1.0m' },
      { input: 90000, expected: '1.5m' },
      { input: 3600000, expected: '1.0h' },
      { input: 5400000, expected: '1.5h' },
      { input: 86400000, expected: '1.0d' },
      { input: -1000, expected: '-1.0s' },
      { input: null, expected: '0ms' },
      { input: undefined, expected: '0ms' },
      { input: NaN, expected: '0ms' }
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should format ${input}ms as "${expected}"`, () => {
        expect(formatDuration(input as any)).toBe(expected);
      });
    });
  });

  describe('formatBytes', () => {
    const testCases = [
      { input: 0, expected: '0 B' },
      { input: 512, expected: '512 B' },
      { input: 1024, expected: '1.0 KB' },
      { input: 1536, expected: '1.5 KB' },
      { input: 1048576, expected: '1.0 MB' },
      { input: 1572864, expected: '1.5 MB' },
      { input: 1073741824, expected: '1.0 GB' },
      { input: 1610612736, expected: '1.5 GB' },
      { input: 1099511627776, expected: '1.0 TB' },
      { input: -1024, expected: '-1.0 KB' },
      { input: null, expected: '0 B' },
      { input: undefined, expected: '0 B' },
      { input: NaN, expected: '0 B' }
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should format ${input} bytes as "${expected}"`, () => {
        expect(formatBytes(input as any)).toBe(expected);
      });
    });
  });
});