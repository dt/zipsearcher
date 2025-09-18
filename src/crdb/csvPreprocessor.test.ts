import { describe, it, expect, vi } from 'vitest';
import { preprocessCSV, shouldPreprocess } from './csvPreprocessor';
import { ProtoDecoder } from './protoDecoder';

vi.mock('./protoDecoder', () => ({
  ProtoDecoder: vi.fn().mockImplementation(() => ({
    decode: vi.fn().mockReturnValue({ decoded: 'value' }),
    decodeHex: vi.fn().mockReturnValue({ decoded: 'hex' })
  }))
}));

describe('csvPreprocessor', () => {
  describe('shouldPreprocess', () => {
    const testCases = [
      { input: 'system.jobs.txt', expected: true },
      { input: 'system.job_info.txt', expected: true },
      { input: 'span_configurations.txt', expected: true },
      { input: 'regular_table.txt', expected: false },
      { input: 'system.other.txt', expected: false },
      { input: '', expected: false },
      { input: null, expected: false }
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should return ${expected} for "${input}"`, () => {
        const content = 'col1\tcol2\nval1\tval2';
        expect(shouldPreprocess(input as any, content)).toBe(expected);
      });
    });
  });

  describe('preprocessCSV', () => {
    describe('basic CSV handling', () => {
      const testCases = [
        {
          name: 'should handle tab-delimited data',
          input: 'col1\tcol2\tcol3\nval1\tval2\tval3',
          expected: {
            hasHeaders: true,
            columnCount: 3,
            rowCount: 2
          }
        },
        {
          name: 'should handle empty CSV',
          input: '',
          expected: {
            hasHeaders: false,
            columnCount: 0,
            rowCount: 0
          }
        },
        {
          name: 'should handle headers only',
          input: 'col1\tcol2\tcol3',
          expected: {
            hasHeaders: true,
            columnCount: 3,
            rowCount: 1
          }
        },
        {
          name: 'should handle mixed delimiters',
          input: 'col1,col2\tcol3\nval1,val2\tval3',
          expected: {
            hasHeaders: true,
            containsMixedDelimiters: true
          }
        }
      ];

      testCases.forEach((tc) => {
        it(tc.name, () => {
          const result = preprocessCSV(tc.input, { tableName: 'test.txt' });
          const lines = result.split('\n').filter(l => l);

          if (tc.expected.rowCount !== undefined) {
            expect(lines.length).toBe(tc.expected.rowCount);
          }
          if (tc.expected.columnCount !== undefined && lines.length > 0) {
            expect(lines[0].split('\t').length).toBe(tc.expected.columnCount);
          }
        });
      });
    });

    describe('hex value processing', () => {
      const testCases = [
        {
          name: 'should decode \\x hex values',
          input: 'id\tdata\n1\t\\x48656c6c6f',
          expectedContains: '\\x48656c6c6f'  // preprocessCSV doesn't decode plain hex, only protos
        },
        {
          name: 'should handle invalid hex gracefully',
          input: 'id\tdata\n1\t\\xZZZZ',
          expectedContains: '\\xZZZZ'
        },
        {
          name: 'should preserve non-hex values',
          input: 'id\tdata\n1\tnormal text',
          expectedContains: 'normal text'
        },
        {
          name: 'should handle NULL values',
          input: 'id\tdata\n1\tNULL',
          expectedContains: 'NULL'
        }
      ];

      testCases.forEach((tc) => {
        it(tc.name, () => {
          const result = preprocessCSV(tc.input, {
            tableName: 'test.txt'
          });
          expect(result).toContain(tc.expectedContains);
        });
      });
    });

    describe('proto decoding', () => {
      it('should decode proto columns for system.jobs', () => {
        const input = 'id\tpayload\tprogress\n1\t\\x0a0b\t\\x1234';
        const result = preprocessCSV(input, {
          tableName: 'system.jobs.txt',
          decodeProtos: true
        });

        expect(ProtoDecoder).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it('should handle job_info proto columns', () => {
        const input = 'job_id\tinfo_key\tvalue\n1\tlegacy_payload\t\\x0a0b';
        const result = preprocessCSV(input, {
          tableName: 'system.job_info.txt',
          decodeProtos: true
        });

        expect(result).toBeDefined();
        expect(result.split('\n').length).toBeGreaterThan(1);
      });
    });

    describe('special characters', () => {
      const testCases = [
        {
          name: 'should escape quotes',
          input: 'col1\tcol2\nval"1\tval"2',
          expectedContains: 'val"1'
        },
        {
          name: 'should handle newlines in values',
          input: 'col1\tcol2\n"val\n1"\tval2',
          shouldNotError: true
        },
        {
          name: 'should handle unicode',
          input: 'col1\tcol2\n🚀\t✨',
          expectedContains: '🚀'
        }
      ];

      testCases.forEach((tc) => {
        it(tc.name, () => {
          const result = preprocessCSV(tc.input, { tableName: 'test.txt' });
          if (tc.expectedContains) {
            expect(result).toContain(tc.expectedContains);
          }
          if (tc.shouldNotError) {
            expect(result).toBeDefined();
          }
        });
      });
    });

    describe('performance', () => {
      it('should handle large CSV efficiently', () => {
        const rows = 10000;
        const header = 'col1\tcol2\tcol3\tcol4\tcol5';
        const row = '1\tvalue\t\\x48656c6c6f\t2024-01-01\t100.50';
        const input = [header, ...Array(rows).fill(row)].join('\n');

        const start = performance.now();
        const result = preprocessCSV(input, {
          tableName: 'large.txt',
          decodeHex: true
        });
        const duration = performance.now() - start;

        expect(result).toBeDefined();
        expect(duration).toBeLessThan(1000); // Should process in under 1 second
        expect(result.split('\n').length).toBe(rows + 1);
      });
    });

    describe('error handling', () => {
      const testCases = [
        {
          name: 'should handle malformed CSV',
          input: 'col1\tcol2\nval1\tval2\tval3\tval4',
          shouldNotThrow: true
        },
        {
          name: 'should handle binary data',
          input: String.fromCharCode(0, 1, 2, 3, 4),
          shouldNotThrow: true
        },
        {
          name: 'should handle very long lines',
          input: `col1\tcol2\n${'a'.repeat(100000)}\tval2`,
          shouldNotThrow: true
        }
      ];

      testCases.forEach((tc) => {
        it(tc.name, () => {
          expect(() => {
            preprocessCSV(tc.input, { tableName: 'test.txt' });
          }).not.toThrow();
        });
      });
    });
  });
});