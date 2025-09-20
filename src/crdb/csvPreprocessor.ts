import { protoDecoder } from './protoDecoder';
import { prettyKey } from './prettyKey';
import { findProtoType } from './protoRegistry';

// Utility function to try replacing a value with its pretty key representation
function tryReplaceWithPrettyKey(value: string): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  // Handle hex keys (start with \x)
  if (value === '\\x' || value.startsWith('\\x')) {
    try {
      const decoded = prettyKey(value);
      return decoded.pretty;
    } catch {
      return value;
    }
  }

  // Handle base64-encoded keys
  if (/^[A-Za-z0-9+/]*(=|==)?$/.test(value) && value.length % 4 === 0) {
    try {
      // Browser-compatible base64 decoding
      const binaryString = atob(value);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

      // For base64-decoded keys, try to format even short values
      if (hexStr.length >= 2 && hexStr.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hexStr)) {
        // Single byte values are likely table IDs
        if (hexStr.length === 2) {
          const tableId = parseInt(hexStr, 16);
          return `/Table/${tableId}`;
        }

        // For longer values, try prettyKey
        try {
          const decoded = prettyKey(hexStr);
          if (decoded.pretty !== hexStr) {
            return decoded.pretty;
          }
        } catch (err) {
          // Ignore prettyKey failures
        }
      }
    } catch (err) {
      // Ignore base64 decode failures
    }
  }

  return value;
}

// Recursively process an object/array to replace key fields
function processObjectForKeys(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => processObjectForKeys(item));
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes('key') && typeof value === 'string') {
        result[key] = tryReplaceWithPrettyKey(value);
      } else {
        result[key] = processObjectForKeys(value);
      }
    }
    return result;
  }

  return obj;
}

export interface PreprocessOptions {
  tableName: string;
  delimiter?: string;
  decodeProtos?: boolean;
  decodeKeys?: boolean;
}

// Parse CSV/TSV content and return header and rows
function parseDelimited(content: string, delimiter: string = '\t'): { headers: string[]; rows: string[][] } {
  const lines = content.trim().split('\n');
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(delimiter);
  const rows = lines.slice(1).map(line => line.split(delimiter));

  return { headers, rows };
}

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  // Remove \x prefix if present
  hex = hex.replace(/^\\x/i, '');

  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}


// Main preprocessing function - transforms keys in place
export function preprocessCSV(
  content: string,
  options: PreprocessOptions
): string {
  const delimiter = options.delimiter || '\t';
  const { headers, rows } = parseDelimited(content, delimiter);

  if (headers.length === 0) {
    return content;
  }

  // Find columns that need special processing and their mappings
  const keyColumns = new Set<number>();
  const protoColumns = new Map<number, string | null>(); // Map column index to proto type (or null if no mapping)
  let infoKeyColumnIndex = -1; // For dynamic proto resolution in job_info table


  headers.forEach((header, index) => {
    const columnName = header.toLowerCase();

    // Check for key columns
    if (options.decodeKeys) {
      if (columnName.includes('key') ||
          columnName === 'start' ||
          columnName === 'end' ||
          columnName.includes('start_key') ||
          columnName.includes('end_key')) {
        keyColumns.add(index);
      }
    }

    // Track info_key column for job_info tables
    if (columnName === 'info_key' && options.tableName.toLowerCase().includes('job_info')) {
      infoKeyColumnIndex = index;
    }

    // Check for proto columns
    if (options.decodeProtos) {
      if (columnName === 'config' || columnName === 'descriptor' ||
          columnName === 'payload' || columnName === 'progress' || columnName === 'value') {
        const mapping = findProtoType(options.tableName, header);
        protoColumns.set(index, mapping?.protoType || null);
      }
    }
  });




  // If no columns need processing and we're not doing JSON key processing, return original content
  if (keyColumns.size === 0 && protoColumns.size === 0 && !options.decodeKeys) {
    return content;
  }

  // Process rows - transform values in place

  const processedRows = rows.map((row) => {
    return row.map((value, colIndex) => {

      // Transform key columns
      if (keyColumns.has(colIndex)) {
        // Handle null/empty differently from \x (which is a valid empty key)
        if (value === '\\N' || value === 'NULL') {
          return value;
        }
        return tryReplaceWithPrettyKey(value);
      }

      // Transform proto columns
      let protoType = protoColumns.get(colIndex);
      if (protoType !== undefined && options.decodeProtos) {
        // Handle dynamic proto type resolution for job_info table
        if (protoType === 'dynamic:job_info' && infoKeyColumnIndex >= 0) {
          const infoKey = row[infoKeyColumnIndex];
          if (infoKey === 'legacy_payload') {
            protoType = 'cockroach.sql.jobs.jobspb.Payload';
          } else if (infoKey === 'legacy_progress') {
            protoType = 'cockroach.sql.jobs.jobspb.Progress';
          } else {
            protoType = null; // Unknown info_key type
          }

        }

        if (value && value !== '\\N' && value !== 'NULL') {
          // Special case: job_info table might have JSON-like strings that aren't protobuf
          if (value.startsWith('{') && value.endsWith('}')) {
            // This is already JSON or JSON-like, leave it as is
            return value;
          }

          // If we have an explicit proto mapping, decode it
          if (protoType && protoType !== 'dynamic:job_info') {
              try {

                const bytes = hexToBytes(value);


                const decoded = protoDecoder.decode(bytes, protoType);

                // Don't use fallback for job_info - if the specific proto fails, leave as hex
                // The fallback was incorrectly decoding Progress data as SpanConfig

                if (decoded.decoded && !decoded.error) {
                  // Return as compact JSON string
                  return JSON.stringify(decoded.decoded);
                }
              } catch {
                // Don't let protobuf errors stop processing of subsequent rows
              }
          }
        }
      }

      // Process JSON columns for key fields (handle both regular and escaped JSON)
      if (value && typeof value === 'string') {
        let jsonStr = value.trim();

        // Check for quoted JSON with doubled quotes inside
        if (jsonStr.startsWith('"{') && jsonStr.endsWith('}"') && jsonStr.includes('""')) {
          try {
            // Remove outer quotes
            jsonStr = jsonStr.slice(1, -1);
            // Convert doubled quotes to single quotes (\"\") -> (\")
            jsonStr = jsonStr.replace(/\"\"/g, '"');
          } catch (e) {
            // Ignore JSON fix failures
          }
        }

        // Now check if we have JSON (either direct or processed)
        if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
          try {
            const jsonObj = JSON.parse(jsonStr);
            const processedObj = processObjectForKeys(jsonObj);
            const result = JSON.stringify(processedObj);

            // If it was originally quoted JSON with doubled quotes, restore the format
            if (value.startsWith('"{') && value.endsWith('}"') && value.includes('""')) {
              return '"' + result.replace(/"/g, '""') + '"';
            }
            return result;
          } catch (e) {
            // If JSON parsing fails, leave original value
          }
        }
      }

      return value;
    });
  });

  // Reconstruct the CSV with transformed values
  const processedLines = [
    headers.join(delimiter),
    ...processedRows.map(row => row.join(delimiter))
  ];


  return processedLines.join('\n');
}

// Check if preprocessing would be beneficial for this table
export function shouldPreprocess(tableName: string, content: string): boolean {
  const normalizedName = tableName.toLowerCase();

  // Check for known CRDB system tables with proto/hex data
  const knownTables = [
    'span_config',  // matches span_configurations, span_configs, etc.
    'zones',
    'descriptor',
    'jobs',
    'job_info',
    'lease',
    'rangelog',
    'replication_stats'
  ];

  const isKnownTable = knownTables.some(t => normalizedName.includes(t));
  if (isKnownTable) {
    return true;
  }

  // Sample first few lines to check for hex data
  const lines = content.split('\n').slice(0, 5);
  for (const line of lines) {
    if (line.includes('\\x')) {
      return true;
    }
  }

  return false;
}