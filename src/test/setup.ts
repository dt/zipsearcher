import { expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';

// 1) fetch for Node
import { fetch, Headers, Request, Response } from 'undici'
Object.assign(globalThis, { fetch, Headers, Request, Response })

// 2) browser-compatible Worker in Node
//    (web-worker works in Node & falls back to native Worker in browsers)
import NodeWorker from 'web-worker'
Object.assign(globalThis, { Worker: NodeWorker })

// 3) Blob and URL for creating worker blobs
import { Blob } from 'buffer'
Object.assign(globalThis, { Blob })

// Add URL.createObjectURL and revokeObjectURL for blob URLs
if (!globalThis.URL) {
  Object.assign(globalThis, {
    URL: {
      createObjectURL: (blob: Blob) => {
        // For Node.js, we'll use a data URL
        return `data:application/javascript;base64,${blob.toString('base64')}`
      },
      revokeObjectURL: () => {
        // No-op for Node.js
      }
    }
  })
}

// For React component tests that might still need cleanup
try {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
  });
} catch {
  // @testing-library/react not available in pure Node tests
}

// Mock browser APIs that might be needed by some tests
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window APIs for tests that might need them
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}