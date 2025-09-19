import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProtoDecoder } from './protoDecoder';

vi.mock('protobufjs', () => ({
  Root: {
    fromDescriptor: vi.fn().mockReturnValue({
      lookupType: vi.fn().mockReturnValue({
        decode: vi.fn().mockReturnValue({
          toJSON: vi.fn().mockReturnValue({ field: 'value' })
        })
      })
    })
  }
}));

vi.mock('protobufjs/ext/descriptor', () => ({
  FileDescriptorSet: {
    decode: vi.fn().mockReturnValue({})
  }
}));

describe.skip('ProtoDecoder', () => {
  let decoder: ProtoDecoder;

  beforeEach(() => {
    vi.clearAllMocks();
    decoder = new ProtoDecoder();
  });

  describe('decode', () => {
    const testCases = [
      {
        name: 'decode with type name',
        input: new Uint8Array([0x08, 0x96, 0x01]),
        typeName: 'test.Message',
        shouldDecode: true
      },
      {
        name: 'decode without type name',
        input: new Uint8Array([0x08, 0x96, 0x01]),
        typeName: undefined,
        shouldReturnError: true
      },
      {
        name: 'handle empty bytes',
        input: new Uint8Array(0),
        typeName: 'test.Message',
        shouldDecode: true
      }
    ];

    testCases.forEach(({ name, input, typeName, shouldDecode, shouldReturnError }) => {
      it(`should ${name}`, () => {
        const result = decoder.decode(input, typeName);

        if (shouldReturnError) {
          expect(result.error).toBeDefined();
        } else if (shouldDecode) {
          expect(result.raw).toEqual(input);
          expect(result.typeName).toBe(typeName);
        }
      });
    });
  });

  describe('parseProtoValue', () => {
    const testCases = [
      {
        name: 'parse hex string',
        input: '\\x0a0b0c',
        typeName: 'Message',
        shouldDecode: true
      },
      {
        name: 'handle NULL',
        input: 'NULL',
        typeName: 'Message',
        expected: null
      },
      {
        name: 'handle empty string',
        input: '',
        typeName: 'Message',
        expected: null
      }
    ];

    testCases.forEach(({ name, input, typeName, expected, shouldDecode }) => {
      it(`should ${name}`, () => {
        const result = decoder.parseProtoValue(input, typeName);
        if (expected === null) {
          expect(result).toBeNull();
        } else if (shouldDecode) {
          expect(result).toBeDefined();
        }
      });
    });
  });

  describe('edge cases', () => {
    it('should handle unloaded state', () => {
      const result = decoder.decode(new Uint8Array([1, 2, 3]), 'test.Type');
      expect(result.error).toContain('not loaded');
    });

    it('should handle missing type name', () => {
      const result = decoder.decode(new Uint8Array([1, 2, 3]));
      expect(result.error).toContain('No type name');
    });
  });
});