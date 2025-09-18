export interface ParsedKey {
  type: string;
  id?: string;
  detail?: string;
  raw: string;
}

export function parseKey(key: any): ParsedKey {
  if (!key) return { type: 'Unknown', raw: String(key) };

  const keyStr = String(key);
  const parts = keyStr.split('/').filter(Boolean);

  if (parts.length === 0) return { type: 'Unknown', raw: keyStr };

  const type = parts[0];

  if (type === 'Table' && parts[1]) {
    return { type, id: parts[1], raw: keyStr };
  }

  if ((type === 'System' || type === 'Local') && parts.length > 1) {
    return { type, detail: parts.slice(1).join('/'), raw: keyStr };
  }

  return { type: 'Unknown', raw: keyStr };
}

export function parseTimestamp(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) return value;

  const str = String(value);

  // Handle nanosecond timestamps (19 digits)
  if (/^\d{19}$/.test(str)) {
    return new Date(parseInt(str) / 1000000);
  }

  // Handle decimal seconds with nanoseconds
  if (/^\d+\.\d{9}$/.test(str)) {
    return new Date(parseFloat(str) * 1000);
  }

  // Handle millisecond timestamps
  if (/^\d{13}$/.test(str)) {
    return new Date(parseInt(str));
  }

  // Handle regular numbers as milliseconds
  if (typeof value === 'number' && !isNaN(value)) {
    return new Date(value);
  }

  // Try parsing as ISO string
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

export function formatDuration(ms: any): string {
  if (!ms || isNaN(ms)) return '0ms';

  const absMs = Math.abs(ms);
  const sign = ms < 0 ? '-' : '';

  if (absMs < 1000) return `${sign}${absMs}ms`;
  if (absMs < 60000) return `${sign}${(absMs / 1000).toFixed(1)}s`;
  if (absMs < 3600000) return `${sign}${(absMs / 60000).toFixed(1)}m`;
  if (absMs < 86400000) return `${sign}${(absMs / 3600000).toFixed(1)}h`;
  return `${sign}${(absMs / 86400000).toFixed(1)}d`;
}

export function formatBytes(bytes: any): string {
  if (!bytes || isNaN(bytes)) return '0 B';

  const absBytes = Math.abs(bytes);
  const sign = bytes < 0 ? '-' : '';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = absBytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  if (unitIndex === 0) {
    return `${sign}${value} ${units[unitIndex]}`;
  }

  return `${sign}${value.toFixed(1)} ${units[unitIndex]}`;
}