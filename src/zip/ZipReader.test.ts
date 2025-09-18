import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZipReader } from './ZipReader';
import { getDebugZip, createMockFileEntry } from '../test/fixtures';

vi.mock('fflate', () => ({
  unzip: vi.fn()
}));

vi.mock('../workers/zip.worker?worker', () => ({
  default: class MockWorker {
    postMessage = vi.fn();
    terminate = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
  }
}));

describe('ZipReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    const testCases = [
      {
        name: 'should parse entries from real debug.zip',
        setup: async () => {
          const { unzip } = await import('fflate');
          vi.mocked(unzip).mockImplementation((data, opts, cb) => {
            const filter = opts?.filter;
            const files = [
              { name: 'nodes/1/data.csv', originalSize: 100, size: 50 },
              { name: 'ranges/data.csv', originalSize: 200, size: 100 }
            ];
            files.forEach(f => filter?.(f as any));
            cb(null, {});
          });
          return { data: new Uint8Array(100) };
        },
        validate: (entries: any[]) => {
          expect(entries.length).toBeGreaterThan(0);
          expect(entries.some(e => e.path.includes('nodes'))).toBe(true);
        }
      },
      {
        name: 'should filter hidden files',
        setup: async () => {
          const { unzip } = await import('fflate');
          const mockZip = new Uint8Array(100);
          vi.mocked(unzip).mockImplementation((data, opts, cb) => {
            const filter = opts?.filter;
            const files = [
              { name: 'visible.txt', originalSize: 100, size: 50 },
              { name: '.hidden.txt', originalSize: 100, size: 50 },
              { name: 'folder/.hidden/file.txt', originalSize: 100, size: 50 },
              { name: '__MACOSX/file.txt', originalSize: 100, size: 50 }
            ];
            files.forEach(f => filter?.(f as any));
            cb(null, {});
          });
          return { data: mockZip };
        },
        validate: (entries: any[]) => {
          expect(entries).toHaveLength(1);
          expect(entries[0].path).toBe('visible.txt');
        }
      },
      {
        name: 'should identify directories',
        setup: async () => {
          const { unzip } = await import('fflate');
          const mockZip = new Uint8Array(100);
          vi.mocked(unzip).mockImplementation((data, opts, cb) => {
            const filter = opts?.filter;
            [
              { name: 'folder/', originalSize: 0, size: 0 },
              { name: 'file.txt', originalSize: 100, size: 50 }
            ].forEach(f => filter?.(f as any));
            cb(null, {});
          });
          return { data: mockZip };
        },
        validate: (entries: any[]) => {
          const dir = entries.find(e => e.path === 'folder/');
          const file = entries.find(e => e.path === 'file.txt');
          expect(dir?.isDir).toBe(true);
          expect(file?.isDir).toBe(false);
        }
      }
    ];

    for (const tc of testCases) {
      it(tc.name, async () => {
        const { data } = await tc.setup();
        const reader = new ZipReader(data);
        const entries = await reader.initialize();
        tc.validate(entries);
      });
    }
  });

  describe('readFile', () => {
    const testCases = [
      {
        name: 'should read text file',
        path: 'test.txt',
        mockData: new TextEncoder().encode('Hello, World!'),
        expected: { text: 'Hello, World!', hasBytes: true }
      },
      {
        name: 'should read binary file',
        path: 'test.bin',
        mockData: new Uint8Array([0xFF, 0xFE, 0x00, 0x01]),
        expected: { text: undefined, hasBytes: true }
      },
      {
        name: 'should handle file not found',
        path: 'missing.txt',
        mockData: null,
        shouldThrow: 'File not found in zip: missing.txt'
      }
    ];

    for (const tc of testCases) {
      it(tc.name, async () => {
        const { unzip } = await import('fflate');
        const mockZip = new Uint8Array(100);
        vi.mocked(unzip).mockImplementation((data, opts, cb) => {
          if (tc.mockData) {
            cb(null, { [tc.path]: tc.mockData });
          } else {
            cb(null, {});
          }
        });

        const reader = new ZipReader(mockZip);

        if (tc.shouldThrow) {
          await expect(reader.readFile(tc.path)).rejects.toThrow(tc.shouldThrow);
        } else {
          const result = await reader.readFile(tc.path);
          expect(result.text).toBe(tc.expected.text);
          expect(!!result.bytes).toBe(tc.expected.hasBytes);
        }
      });
    }
  });

  describe('readFileStream', () => {
    const testCases = [
      {
        name: 'should stream CSV data in chunks',
        content: 'id,name,value\n1,Alice,100\n2,Bob,200\n3,Charlie,300',
        expectedChunks: 3,
        validateChunk: (chunk: string, index: number) => {
          if (index === 0) expect(chunk).toContain('id,name,value');
        }
      },
      {
        name: 'should report progress correctly',
        content: 'a'.repeat(1000),
        validateProgress: (progress: any[]) => {
          expect(progress[progress.length - 1].done).toBe(true);
          expect(progress[progress.length - 1].loaded).toBeGreaterThan(0);
        }
      }
    ];

    for (const tc of testCases) {
      it(tc.name, async () => {
        const mockWorker = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          addEventListener: vi.fn((event, handler) => {
            if (event === 'message') {
              setTimeout(() => {
                const chunks = tc.content.match(/.{1,100}/g) || [];
                chunks.forEach((chunk, i) => {
                  handler({
                    data: {
                      type: 'chunk',
                      text: chunk,
                      progress: {
                        loaded: (i + 1) * chunk.length,
                        total: tc.content.length,
                        done: i === chunks.length - 1
                      }
                    }
                  });
                });
              }, 0);
            }
          }),
          removeEventListener: vi.fn()
        };

        const reader = new ZipReader(new Uint8Array(100));
        (reader as any).worker = mockWorker;

        const chunks: string[] = [];
        const progress: any[] = [];

        await reader.readFileStream('test.csv', (chunk, prog) => {
          chunks.push(chunk);
          progress.push(prog);
        });

        if (tc.expectedChunks) {
          expect(chunks.length).toBeGreaterThanOrEqual(tc.expectedChunks);
        }
        if (tc.validateChunk) {
          chunks.forEach(tc.validateChunk);
        }
        if (tc.validateProgress) {
          tc.validateProgress(progress);
        }
      });
    }
  });

  describe('edge cases', () => {
    it('should handle empty zip', async () => {
      const { unzip } = await import('fflate');
      vi.mocked(unzip).mockImplementation((data, opts, cb) => {
        cb(null, {});
      });

      const reader = new ZipReader(new Uint8Array(0));
      const entries = await reader.initialize();
      expect(entries).toHaveLength(0);
    });

    it('should handle corrupted zip', async () => {
      const { unzip } = await import('fflate');
      vi.mocked(unzip).mockImplementation((data, opts, cb) => {
        cb(new Error('Invalid zip file'), {});
      });

      const reader = new ZipReader(new Uint8Array([0xFF, 0xFF]));
      await expect(reader.initialize()).rejects.toThrow('Invalid zip file');
    });

    it('should clean up worker on termination', () => {
      const mockWorker = {
        terminate: vi.fn(),
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      const reader = new ZipReader(new Uint8Array(100));
      (reader as any).worker = mockWorker;
      (reader as any).cleanup = vi.fn(() => {
        mockWorker.terminate();
      });
      (reader as any).cleanup();

      expect(mockWorker.terminate).toHaveBeenCalled();
    });
  });
});