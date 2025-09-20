import * as fflate from 'fflate';

type WorkerMessage =
  | { type: 'loadFile'; path: string; zipData: Uint8Array }
  | { type: 'cancel' };

type WorkerResponse =
  | { type: 'progress'; loaded: number; total: number; percent: number }
  | { type: 'chunk'; data: string; loaded: number; total: number; done: boolean }
  | { type: 'error'; error: string }
  | { type: 'complete'; text: string };

let currentOperation: AbortController | null = null;

// Stream decompression with chunks
async function streamFile(path: string, zipData: Uint8Array) {
  currentOperation = new AbortController();
  const signal = currentOperation.signal;

  try {
    let foundFile = false;
    let accumulatedData = new Uint8Array(0);
    let fileSize = 0;
    let processedBytes = 0;
    const decoder = new TextDecoder('utf-8');
    let fullText = '';

    await new Promise<void>((resolve, reject) => {
      // Create unzipper
      const unzipper = new fflate.Unzip();

      // Register decompressor
      unzipper.register(fflate.UnzipInflate);

      // Handle file discovery
      unzipper.onfile = (file) => {
        if (file.name === path) {
          foundFile = true;
          fileSize = file.originalSize || 0;

          // Send initial progress
          self.postMessage({
            type: 'progress',
            loaded: 0,
            total: fileSize,
            percent: 0
          } as WorkerResponse);

          // Set up streaming handler for this file
          file.ondata = (err, chunk, final) => {
            if (err) {
              reject(err);
              return;
            }

            if (signal.aborted) {
              reject(new Error('Operation cancelled'));
              return;
            }

            // Accumulate data
            if (chunk) {
              const newData = new Uint8Array(accumulatedData.length + chunk.length);
              newData.set(accumulatedData);
              newData.set(chunk, accumulatedData.length);
              accumulatedData = newData;
              processedBytes += chunk.length;

              // Decode text chunk
              const decodedChunk = decoder.decode(chunk, { stream: !final });
              fullText += decodedChunk;

              // Send chunk to main thread
              self.postMessage({
                type: 'chunk',
                data: decodedChunk,
                loaded: processedBytes,
                total: fileSize,
                done: final
              } as WorkerResponse);
            }

            if (final) {
              // Send complete message
              self.postMessage({
                type: 'complete',
                text: fullText
              } as WorkerResponse);
              resolve();
            }
          };

          // Start processing this file
          file.start();
        }
      };

      // Push the entire zip data
      // In a real streaming scenario, you'd push chunks as they arrive
      const chunkSize = 1024 * 1024; // 1MB chunks for processing
      let offset = 0;

      const pushNextChunk = () => {
        if (signal.aborted) {
          reject(new Error('Operation cancelled'));
          return;
        }

        const end = Math.min(offset + chunkSize, zipData.length);
        const chunk = zipData.slice(offset, end);
        const isFinal = end >= zipData.length;

        unzipper.push(chunk, isFinal);

        if (!isFinal) {
          offset = end;
          // Use setImmediate or setTimeout to prevent blocking
          setTimeout(pushNextChunk, 0);
        } else if (!foundFile) {
          reject(new Error(`File not found: ${path}`));
        }
      };

      pushNextChunk();
    });

  } catch (error) {
    if (!signal.aborted) {
      self.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      } as WorkerResponse);
    }
  } finally {
    currentOperation = null;
  }
}

// Handle messages from main thread
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;

  switch (type) {
    case 'loadFile':
      const { path, zipData } = event.data;
      await streamFile(path, zipData);
      break;

    case 'cancel':
      if (currentOperation) {
        currentOperation.abort();
        currentOperation = null;
      }
      break;
  }
});

export {};