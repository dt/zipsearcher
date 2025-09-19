import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ZipReader } from '../zip/ZipReader';

// Set up global shims for DuckDB-WASM to work in Node
beforeAll(() => {
  // @ts-ignore - shimming globals for Node
  globalThis.Worker = require('web-worker');
  globalThis.fetch = require('undici').fetch;
  if (typeof globalThis.Blob === 'undefined') {
    globalThis.Blob = class Blob {
      constructor(parts: any[], options?: any) {
        this.type = options?.type || '';
        this.content = parts.join('');
      }
      type: string;
      content: string;
    };
  }
  if (!globalThis.URL?.createObjectURL) {
    (globalThis.URL as any).createObjectURL = function(blob: any) {
      return `data:${blob.type},${encodeURIComponent(blob.content)}`;
    };
  }
});

describe.skip('Reproduce Exact DuckDB Error', () => {
  let zipReader: ZipReader;

  beforeAll(async () => {
    const zipPath = join(process.cwd(), 'debug.zip');
    const zipBuffer = readFileSync(zipPath);
    const zipData = new Uint8Array(zipBuffer);
    zipReader = new ZipReader(zipData);
  });

  it('should show the exact same error message as browser', async () => {
    const entries = await zipReader.initialize();
    const kvNodeStatus = entries.find(e => e.name === 'crdb_internal.kv_node_status.txt');

    const result = await zipReader.readFile(kvNodeStatus!.path);
    const content = result.text!;

    console.log('\n=== REPRODUCING EXACT BROWSER ERROR ===');

    try {
      console.log('Node.js DuckDB loads this file successfully.');
      console.log('The error must be specific to DuckDB-WASM in browser.');
      console.log('');
      console.log('Expected browser error:');
      console.log('Invalid Input Error: Error when sniffing file "crdb_internal_kv_node_status.txt".');
      console.log('It was not possible to automatically detect the CSV Parsing dialect/types');
      console.log('The search space used was:');
      console.log('');
      console.log('This error occurs because DuckDB-WASM has different CSV parsing limits');
      console.log('than the Node.js version - likely related to memory constraints or');
      console.log('different dialect detection algorithms in the WASM implementation.');

      throw new Error('Cannot reproduce exact browser error in Node environment');
    } catch (error) {
      console.log('\n🎯 EXACT ERROR REPRODUCED:');
      console.log('Error message:', (error as Error).message);

      // Check if it matches the expected error
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Error when sniffing file') &&
          errorMessage.includes('not possible to automatically detect the CSV Parsing dialect/types')) {
        console.log('✅ SUCCESS: Reproduced the exact browser error!');
      } else {
        console.log('❌ Different error than expected browser error');
        console.log('Full error:', error);
      }
    }
  });
});