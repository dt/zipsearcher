import { protoDecoder } from './protoDecoder';
import { prettyKey, isProbablyHexKey } from './prettyKey';
import { findProtoType, looksLikeProtobuf } from './protoRegistry';

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

// This function is no longer used - we add separate columns instead
function preprocessValue(
  value: string,
  columnName: string,
  tableName: string,
  options: PreprocessOptions
): string {
  // Skip null/empty values
  if (!value || value === '\\N' || value === 'NULL') {
    return value;
  }

  // Check if this column should have protobuf data decoded
  if (options.decodeProtos && looksLikeProtobuf(value)) {
    const mapping = findProtoType(tableName, columnName);
    if (mapping) {
      try {
        const bytes = hexToBytes(value);
        const decoded = protoDecoder.decode(bytes, mapping.protoType);

        if (decoded.decoded && !decoded.error) {
          // Return as JSON string
          return JSON.stringify(decoded.decoded);
        }
      } catch (err) {
        console.warn(`Failed to decode proto in ${tableName}.${columnName}:`, err);
      }
    }
  }

  return value;
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

  // Log column identification once
  const columnInfo: string[] = [];

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
        columnInfo.push(`  ${header}: KEY column`);
      }
    }

    // Track info_key column for job_info tables
    if (columnName === 'info_key' && options.tableName.toLowerCase().includes('job_info')) {
      infoKeyColumnIndex = index;
      columnInfo.push(`  ${header}: info_key (for dynamic proto)`);
    }

    // Check for proto columns
    if (options.decodeProtos) {
      if (columnName === 'config' || columnName === 'descriptor' ||
          columnName === 'payload' || columnName === 'progress' || columnName === 'value') {
        const mapping = findProtoType(options.tableName, header);
        protoColumns.set(index, mapping?.protoType || null);
        if (mapping) {
          columnInfo.push(`  ${header}: PROTO column -> ${mapping.protoType}`);
        } else {
          columnInfo.push(`  ${header}: PROTO column (no mapping)`);
        }
      }
    }
  });


  // Debug: Check if we found the config column for span_configurations
  if (options.tableName.toLowerCase().includes('span_config') && protoColumns.size === 0) {
    console.log(`WARNING: No proto columns found for ${options.tableName}. Headers: ${headers.join(', ')}`);
  }

  // If no columns need processing, return original content
  if (keyColumns.size === 0 && protoColumns.size === 0) {
    return content;
  }

  // Process rows - transform values in place
  let dynamicProtoLogged = false;
  let decodeErrors = 0;
  const maxErrorLogs = 3;
  let successCount = 0;

  const processedRows = rows.map((row, rowIndex) => {
    return row.map((value, colIndex) => {
      // Transform key columns
      if (keyColumns.has(colIndex)) {
        // Handle null/empty differently from \x (which is a valid empty key)
        if (value === '\\N' || value === 'NULL') {
          return value;
        }

        // Even empty string or just \x should be processed
        if (value !== undefined && value !== null) {
          if (value === '\\x' || value.startsWith('\\x') || isProbablyHexKey(value)) {
            const decoded = prettyKey(value);
            return decoded.pretty;
          }
        }
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

          // Suppress dynamic proto logging
          // if (!dynamicProtoLogged) {
          //   console.log(`  Dynamic proto: info_key='${infoKey}' -> ${protoType || 'none'}`);
          //   if (value && value.startsWith('\\x')) {
          //     console.log(`  Value is hex data: ${value.substring(0, 50)}...`);
          //   }
          //   dynamicProtoLogged = true;
          // }
        }

        if (value && value !== '\\N' && value !== 'NULL') {
          // Special case: job_info table might have JSON-like strings that aren't protobuf
          if (value.startsWith('{') && value.endsWith('}')) {
            // This is already JSON or JSON-like, leave it as is
            return value;
          }

          if (looksLikeProtobuf(value)) {
            if (protoType && protoType !== 'dynamic:job_info') {
              try {
                const bytes = hexToBytes(value);

                // Suppress decode debugging
                // if (options.tableName.toLowerCase().includes('job_info') && successCount === 0) {
                //   const infoKey = infoKeyColumnIndex >= 0 ? row[infoKeyColumnIndex] : 'unknown';
                //   console.log(`  About to decode ${infoKey} as ${protoType}`);
                //   console.log(`  First bytes: ${Array.from(bytes.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
                // }

                let decoded = protoDecoder.decode(bytes, protoType);

                // Don't use fallback for job_info - if the specific proto fails, leave as hex
                // The fallback was incorrectly decoding Progress data as SpanConfig

                if (decoded.decoded && !decoded.error) {
                  successCount++;
                  // Suppress first decode success logging
                  // if (successCount === 1) {
                  //   console.log(`  First successful decode: ${JSON.stringify(decoded.decoded).substring(0, 100)}...`);
                  // }
                  // Return as compact JSON string
                  return JSON.stringify(decoded.decoded);
                } else if (decoded.error && decodeErrors < maxErrorLogs) {
                  // Only log decode errors in development
                  // console.log(`  Decode error (row ${rowIndex + 1}): ${decoded.error.substring(0, 100)}`);
                  decodeErrors++;
                  // if (decodeErrors === maxErrorLogs) {
                  //   console.log(`  (suppressing further decode errors)`);
                  // }
                }
              } catch (err) {
                if (decodeErrors < maxErrorLogs) {
                  console.log(`  Exception (row ${rowIndex + 1}): ${String(err).substring(0, 100)}`);
                  decodeErrors++;
                }
              }
            }
          } else if (protoType && decodeErrors < maxErrorLogs && value.startsWith('\\x')) {
            // We expected protobuf but the value doesn't look like it
            console.log(`  Row ${rowIndex + 1}: Expected protobuf but got: ${value.substring(0, 30)}...`);
            decodeErrors++;
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

  // Suppress summary logging unless there are significant issues
  // if (protoColumns.size > 0 && successCount === 0 && decodeErrors > 0) {
  //   console.log(`  WARNING: No protobufs successfully decoded (${decodeErrors} errors)`);
  // } else if (successCount > 0) {
  //   console.log(`  Successfully decoded ${successCount} protobuf values`);
  // }

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