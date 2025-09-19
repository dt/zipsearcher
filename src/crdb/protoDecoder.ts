import * as protobuf from 'protobufjs';
import { prettyKey, isProbablyHexKey } from './prettyKey';

export interface ProtoDescriptor {
  name: string;
  root: protobuf.Root;
}

export interface DecodedProto {
  raw: Uint8Array;
  decoded: any;
  typeName?: string;
  error?: string;
}

export class ProtoDecoder {
  private root: protobuf.Root | null = null;
  private loaded = false;

  constructor() {
    // No fallback initialization - only real descriptors
  }

  // Removed - no fallback types allowed

  // Removed - not needed with real descriptors

  async loadCRDBDescriptors(): Promise<void> {
    if (this.loaded) return;

    // Skip loading in test environment
    if (typeof window === 'undefined') {
      console.log('Skipping proto descriptor loading in test environment');
      return;
    }

    try {
      // Load the REAL CRDB descriptor set - NO FALLBACK
      const response = await fetch('./crdb_jobs_complete.pb');
      if (!response.ok) {
        throw new Error('CRDB descriptor file not found - cannot decode protos without it');
      }

      const buffer = await response.arrayBuffer();

      // Use the descriptor extension to properly load the FileDescriptorSet
      const descriptor = await import('protobufjs/ext/descriptor');
      const FileDescriptorSet = descriptor.FileDescriptorSet;
      const fileDescriptorSet = FileDescriptorSet.decode(new Uint8Array(buffer));

      // Create root from the descriptor set
      this.root = protobuf.Root.fromDescriptor(fileDescriptorSet);
      this.loaded = true;

      // console.log('Successfully loaded CRDB proto descriptors');
    } catch (error) {
      console.error('Failed to load CRDB descriptors:', error);
      throw error; // NO FALLBACK - fail if we can't load real descriptors
    }
  }

  parseProtoValue(hexValue: string, typeName?: string): DecodedProto | null {
    try {
      // Remove the \\x prefix if present
      let hex = hexValue;
      if (hex.startsWith('\\\\x')) {
        hex = hex.substring(3);
      }

      // Convert hex string to bytes
      const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);

      if (bytes.length === 0) {
        return null;
      }

      return this.decode(bytes, typeName);
    } catch (error) {
      return null;
    }
  }

  decode(data: Uint8Array, typeName?: string): DecodedProto {
    if (!typeName) {
      return {
        raw: data,
        decoded: null,
        error: 'No type specified for decoding'
      };
    }

    if (!this.loaded || !this.root) {
      return {
        raw: data,
        decoded: null,
        error: 'Proto descriptors not loaded'
      };
    }

    try {
      const type = this.root.lookupType(typeName);
      const message = type.decode(data);

      // Use toObject with proper options for CRDB compatibility
      const decoded = type.toObject(message, {
        longs: String,
        bytes: String,
        defaults: true,
        arrays: true,
        objects: true,
        oneofs: true
      });

      // Transform the decoded message to handle special fields
      const transformed = this.transformMessage(decoded);

      return {
        raw: data,
        decoded: transformed,
        typeName
      };
    } catch (error) {
      return {
        raw: data,
        decoded: null,
        error: `Failed to decode as ${typeName}: ${error}`
      };
    }
  }


  private tryDecodeString(bytes: Uint8Array): string | null {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return decoder.decode(bytes);
    } catch {
      return null;
    }
  }


  private transformMessage(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.transformMessage(item));
    }

    if (typeof obj === 'object') {
      // Special handling for Descriptor protos with union field
      // CRDB outputs these as {"database": {...}} or {"table": {...}}
      if ('union' in obj && obj.union && obj[obj.union]) {
        const unionType = obj.union;
        const content = this.transformMessage(obj[unionType]);
        // Return in CRDB format with union type as top-level key
        return {
          [unionType]: content
        };
      }

      const transformed: any = {};

      for (const [key, value] of Object.entries(obj)) {
        // Convert snake_case to camelCase for consistency with CRDB output
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        transformed[camelKey] = this.transformValue(key, value);
      }

      return transformed;
    }

    return this.transformValue('', obj);
  }

  private transformValue(key: string, value: any): any {
    // Handle base64 encoded bytes fields
    if (typeof value === 'string') {
      // Convert base64 cluster ID to UUID format
      if (key.includes('cluster_id')) {
        try {
          const bytes = Buffer.from(value, 'base64');
          if (bytes.length === 16) {
            const hex = bytes.toString('hex');
            const uuid = [
              hex.substring(0, 8),
              hex.substring(8, 12),
              hex.substring(12, 16),
              hex.substring(16, 20),
              hex.substring(20, 32)
            ].join('-');
            return uuid;
          }
        } catch {}
      }

      // Handle CRDB keys - any field with 'key' in the name or that looks like a key
      // This includes startKey, endKey, key, spans[].key, etc.
      if (key.toLowerCase().includes('key') || isProbablyHexKey(value)) {
        try {
          // First try to decode as base64 (common for proto bytes fields)
          const bytes = Buffer.from(value, 'base64');
          const hexStr = bytes.toString('hex');

          if (isProbablyHexKey(hexStr)) {
            const decoded = prettyKey(hexStr);
            return {
              _type: 'key',
              hex: hexStr,
              pretty: decoded.pretty
            };
          }
        } catch {}

        // Try as direct hex string
        if (isProbablyHexKey(value)) {
          const decoded = prettyKey(value);
          if (decoded.pretty !== value) {
            return {
              _type: 'key',
              hex: value,
              pretty: decoded.pretty
            };
          }
        }
      }
    }

    // Handle roachpb.Span objects with startKey and endKey
    if (typeof value === 'object' && value !== null) {
      // Check if this looks like a Span (has startKey and/or endKey)
      if ('startKey' in value || 'endKey' in value || 'start_key' in value || 'end_key' in value) {
        const transformed: any = {};

        for (const [k, v] of Object.entries(value)) {
          // Convert snake_case to camelCase
          const camelKey = k.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
          // Recursively transform, ensuring key fields are pretty-printed
          transformed[camelKey] = this.transformValue(k, v);
        }

        return transformed;
      }

      // Handle arrays of spans
      if (Array.isArray(value)) {
        return value.map((item, index) => this.transformValue(`${key}[${index}]`, item));
      }

      return this.transformMessage(value);
    }

    return value;
  }

  getAvailableTypes(): string[] {
    if (!this.loaded || !this.root) {
      return [];
    }

    const types: string[] = [];

    function collectTypes(obj: any, prefix = ''): void {
      if (obj && obj.nested) {
        for (const [key, value] of Object.entries(obj.nested)) {
          const fullName = prefix ? `${prefix}.${key}` : key;
          if (value && (value as any).fields) {
            types.push(fullName);
          }
          if (value && (value as any).nested) {
            collectTypes(value, fullName);
          }
        }
      }
    }

    collectTypes(this.root.toJSON());
    return types.sort();
  }
}

export const protoDecoder = new ProtoDecoder();

// Initialize CRDB descriptors on module load
if (typeof window !== 'undefined') {
  protoDecoder.loadCRDBDescriptors().catch(err => {
    console.warn('Failed to load CRDB descriptors on init:', err);
  });
}