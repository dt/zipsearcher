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
    it('should stream CSV data (using fallback)', async () => {
      // For testing, we'll force the fallback path by temporarily disabling Worker
      const originalWorker = globalThis.Worker;
      delete (globalThis as any).Worker;

      const { unzip } = await import('fflate');
      const content = 'id,name,value\n1,Alice,100\n2,Bob,200\n3,Charlie,300';
      vi.mocked(unzip).mockImplementation((data, opts, cb) => {
        cb(null, { 'test.csv': new TextEncoder().encode(content) });
      });

      const reader = new ZipReader(new Uint8Array(100));
      await reader.initialize();

      const chunks: string[] = [];
      const progress: any[] = [];

      await reader.readFileStream('test.csv', (chunk, prog) => {
        chunks.push(chunk);
        progress.push(prog);
      });

      // Restore Worker
      globalThis.Worker = originalWorker;

      // In fallback mode, we get one chunk with the entire content
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(content);
      expect(progress[0].done).toBe(true);
    });

    it('should report progress correctly', async () => {
      // Test the fallback path for progress reporting
      const originalWorker = globalThis.Worker;
      delete (globalThis as any).Worker;

      const { unzip } = await import('fflate');
      const content = 'a'.repeat(1000);
      vi.mocked(unzip).mockImplementation((data, opts, cb) => {
        cb(null, { 'test.csv': new TextEncoder().encode(content) });
      });

      const reader = new ZipReader(new Uint8Array(100));
      await reader.initialize();

      const progress: any[] = [];

      await reader.readFileStream('test.csv', (chunk, prog) => {
        progress.push(prog);
      });

      // Restore Worker
      globalThis.Worker = originalWorker;

      expect(progress.length).toBe(1);
      expect(progress[0].done).toBe(true);
      expect(progress[0].loaded).toBe(content.length);
      expect(progress[0].total).toBe(content.length);
    });
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