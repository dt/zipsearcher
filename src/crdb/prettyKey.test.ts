import { describe, it, expect } from 'vitest';
import { prettyKey, isProbablyHexKey } from './prettyKey';

describe('prettyKey', () => {
  describe('CRDB key decoding', () => {
    const testCases = [
      // System keys
      { hex: '', expected: '/Min' },
      { hex: '\\x', expected: '/Min' },
      { hex: '\\x04006c6976656e6573732d', expected: '/System/NodeLiveness' },
      { hex: '\\x04006c6976656e6573732e', expected: '/System/NodeLivenessMax' },
      { hex: '\\x04747364', expected: '/System/tsd' },
      { hex: '\\x04ff7379732d73636667', expected: '/System/SystemSpanConfigKeys' },

      // Table IDs (single byte)
      { hex: '\\x88', expected: '/Table/0' },
      { hex: '\\x89', expected: '/Table/1' },
      { hex: '\\x8a', expected: '/Table/2' },
      { hex: '\\x8b', expected: '/Table/3' },
      { hex: '\\x9f', expected: '/Table/23' },
      { hex: '\\xa0', expected: '/Table/24' },
      { hex: '\\xa6', expected: '/NamespaceTable/30' },
      { hex: '\\xa7', expected: '/NamespaceTable/Max' },
      { hex: '\\xf5', expected: '/Table/109' },

      // Two-byte table keys
      { hex: '\\xf6\\xbd', expected: '/Table/189' },
      { hex: '\\xf6\\xbe', expected: '/Table/190' },
      { hex: '\\xf7\\xc0', expected: '/Table/49151/PrefixEnd' },

      // Format variations
      { hex: '0x88', expected: '/Table/0' },
      { hex: '0xf6bd', expected: '/Table/189' },
      { hex: 'F6BD', expected: '/Table/189' },
      { hex: 'f6bd', expected: '/Table/189' },

      // ASCII strings
      { hex: '68656c6c6f', expected: 'hello' },
      { hex: '12001300', expected: '/NamespaceTable/Index0' },

      // Invalid
      { hex: 'invalidhex!', expected: expect.stringContaining('invalid hex') },
      { hex: '12345', expected: expect.stringContaining('invalid hex') }
    ];

    testCases.forEach(({ hex, expected }) => {
      it(`"${hex}" -> "${expected}"`, () => {
        const result = prettyKey(hex);
        if (typeof expected === 'string') {
          expect(result.pretty).toBe(expected);
        } else {
          expect(result.pretty).toEqual(expected);
        }
      });
    });
  });

  describe('key parts parsing', () => {
    it('should parse table with index', () => {
      const result = prettyKey('12051306');
      expect(result.parts).toHaveLength(2);
      expect(result.parts[0].type).toBe('table');
      expect(result.parts[1].type).toBe('index');
    });
  });
});

describe('isProbablyHexKey', () => {
  const testCases = [
    // Valid hex keys
    { input: '12001300', expected: true },
    { input: 'f2001300', expected: true },
    { input: 'deadbeef', expected: true },
    { input: '0123456789abcdef', expected: true },
    { input: '0xdeadbeef', expected: true },

    // Invalid
    { input: 'hello', expected: false },
    { input: '12g34', expected: false },
    { input: '12', expected: false },
    { input: '123', expected: false },
    { input: '0x12', expected: false },
    { input: '', expected: false },
    { input: null, expected: false },
    { input: undefined, expected: false }
  ];

  testCases.forEach(({ input, expected }) => {
    it(`"${input}" -> ${expected}`, () => {
      expect(isProbablyHexKey(input as any)).toBe(expected);
    });
  });
});