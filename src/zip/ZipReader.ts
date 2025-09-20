import * as fflate from 'fflate';
import type { ZipEntryMeta } from '../state/types';

type StreamCallback = (chunk: string, progress: {
  loaded: number;
  total: number;
  done: boolean;
}) => void;

export class ZipReader {
  private zipData: Uint8Array;
  private entries: ZipEntryMeta[] = [];
  private worker: Worker | null = null;

  constructor(data: Uint8Array) {
    this.zipData = data;
  }

  async initialize(): Promise<ZipEntryMeta[]> {
    // The async version automatically uses workers for non-blocking operation
    const { unzip } = fflate;

    return new Promise((resolve, reject) => {
      // This runs without blocking the main thread
      unzip(this.zipData, {
        filter: (file) => {
          const path = file.name;
          const isDir = path.endsWith('/');
          const name = path.split('/').pop() || path;

          // Skip hidden files and system files
          const segments = path.split('/');
          const shouldSkip = segments.some(segment =>
            segment.startsWith('.') || segment.startsWith('__')
          );

          if (!shouldSkip) {
            this.entries.push({
              id: path,
              name,
              path,
              size: file.originalSize || 0,
              compressedSize: file.size || 0,
              isDir,
            });
          }

          // Don't decompress any files during initialization - we'll read them on demand
          return false;
        }
      }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(this.entries);
        }
      });
    });
  }

  async readFile(
    path: string,
    _onProgress?: (loaded: number, total: number) => void
  ): Promise<{ text?: string; bytes?: Uint8Array }> {
    // Simple approach using unzip with filter
    const { unzip } = fflate;

    return new Promise((resolve, reject) => {
      unzip(this.zipData, {
        filter: (file) => file.name === path
      }, (err, files) => {
        if (err) {
          reject(err);
          return;
        }

        const data = files[path];
        if (!data) {
          reject(new Error(`File not found in zip: ${path}`));
          return;
        }

        const bytes = data as Uint8Array;

        // Try to decode as text
        try {
          const text = new TextDecoder('utf-8').decode(bytes);
          if (this.isLikelyText(text)) {
            resolve({ text, bytes });
          } else {
            resolve({ bytes });
          }
        } catch {
          resolve({ bytes });
        }
      });
    });
  }

  private isLikelyText(str: string): boolean {
    // Check first 1000 chars for binary content
    const sample = str.slice(0, 1000);
    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      // Allow common control chars (tab, newline, carriage return)
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        return false;
      }
    }
    return true;
  }

  async readFileStream(
    path: string,
    onChunk: StreamCallback,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    // Check if we're in a test environment where Worker isn't available
    if (typeof Worker === 'undefined') {
      // Fallback to non-streaming read in test environment
      const result = await this.readFile(path, onProgress);
      if (result.text) {
        onChunk(result.text, { loaded: result.text.length, total: result.text.length, done: true });
      }
      return;
    }

    return new Promise(async (resolve, reject) => {
      try {
        // Dynamically import the worker
        const { default: ZipWorker } = await import('../workers/zip.worker?worker');

        // Create a new worker for this operation
        this.worker = new ZipWorker();

      this.worker.onmessage = (event) => {
        const response = event.data;

        switch (response.type) {
          case 'chunk':
            onChunk(response.data, {
              loaded: response.loaded,
              total: response.total,
              done: response.done
            });
            if (onProgress) {
              onProgress(response.loaded, response.total);
            }
            break;

          case 'complete':
            this.worker?.terminate();
            this.worker = null;
            resolve();
            break;

          case 'error':
            this.worker?.terminate();
            this.worker = null;
            reject(new Error(response.error));
            break;

          case 'progress':
            if (onProgress) {
              onProgress(response.loaded, response.total);
            }
            break;
        }
      };

        // Start loading the file
        this.worker.postMessage({
          type: 'loadFile',
          path,
          zipData: this.zipData
        });
      } catch (error) {
        // If worker import fails, fallback to non-streaming
        const result = await this.readFile(path, onProgress);
        if (result.text) {
          onChunk(result.text, { loaded: result.text.length, total: result.text.length, done: true });
        }
        resolve();
      }
    });
  }

  cancelStream(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'cancel' });
      this.worker.terminate();
      this.worker = null;
    }
  }
}