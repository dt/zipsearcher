import * as protobuf from 'protobufjs';
import { prettyKey } from './prettyKey';

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

    try {
      const response = await fetch('./crdb.json');
      if (!response.ok) {
        throw new Error('CRDB JSON descriptor file not found');
      }

      const rootJson = await response.json();
      this.root = protobuf.Root.fromJSON(rootJson);
      this.loaded = true;
    } catch (error) {
      console.error('Failed to load CRDB descriptors:', error);
      throw error;
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
        defaults: false,
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
      // Handle key fields - try to replace with pretty key representation
      if (key.toLowerCase().includes('key')) {
        // Handle hex keys (start with \x)
        if (value === '\\x' || value.startsWith('\\x')) {
          try {
            const decoded = prettyKey(value);
            return decoded.pretty;
          } catch {
            // If prettyKey fails, return original value
          }
        }
        // Handle base64-encoded keys
        else if (/^[A-Za-z0-9+/]*(=|==)?$/.test(value) && value.length % 4 === 0) {
          try {
            const bytes = Buffer.from(value, 'base64');
            const hexStr = bytes.toString('hex');
            const decoded = prettyKey(hexStr);
            if (decoded.pretty !== hexStr) {
              return decoded.pretty;
            }
          } catch {}
        }
      }

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

// Initialize CRDB descriptors on module load (skip in test environment)
if (typeof window !== 'undefined' && typeof process === 'undefined') {
  protoDecoder.loadCRDBDescriptors().catch(err => {
    console.warn('Failed to load CRDB descriptors on init:', err);
  });
}