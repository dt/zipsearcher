export { prettyKey, isProbablyHexKey, type DecodedKey, type KeyPart } from './prettyKey';
export { ProtoDecoder, protoDecoder, type DecodedProto, type ProtoDescriptor } from './protoDecoder';

export function detectAndTransform(value: any): any {
  if (typeof value === 'string') {
    if (value.startsWith('{') && value.endsWith('}')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
  }

  return value;
}

export function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    // Handle Date objects
    if (value instanceof Date) {
      // Format as ISO 8601
      return value.toISOString();
    }

    return JSON.stringify(value, null, 2);
  }

  return String(value);
}