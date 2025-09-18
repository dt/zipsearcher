export interface DecodedKey {
  raw: string;
  pretty: string;
  parts: KeyPart[];
}

export interface KeyPart {
  type: string;
  value: string | number;
  raw?: string;
}

const SYSTEM_TABLES: Record<number, string> = {
  0: 'NamespaceTable',
  1: 'DescriptorTable',
  2: 'UsersTable',
  3: 'ZonesTable',
  4: 'SettingsTable',
  5: 'SystemDatabaseID',
  11: 'TenantsTable',
  12: 'SystemUITable',
  13: 'PrivilegeTable',
  14: 'EventLogTable',
  15: 'RangeEventTable',
  20: 'RoleOptionsTable',
  21: 'StatementDiagnosticsRequestsTable',
  22: 'StatementDiagnosticsTable',
  23: 'ScheduledJobsTable',
  24: 'SqllivenessTable',
  25: 'MigrationsTable',
  26: 'JoinTokensTable',
  27: 'StatementStatisticsTable',
  28: 'TransactionStatisticsTable',
  29: 'DatabaseRoleSettingsTable',
  30: 'TenantUsageTable',
  31: 'SqlInstancesTable',
  32: 'SpanConfigurationsTable',
  33: 'TaskPayloadsTable',
  34: 'TenantSettingsTable',
  35: 'SpanCountTable',
  36: 'SystemPrivilegeTable',
  37: 'ExternalConnectionsTable',
  38: 'SystemExternalConnectionsPrivilegeTable',
  39: 'JobInfoTable',
  40: 'JobStatusTable',
  41: 'RegionsTable',
  42: 'RoleMembersTable',
  43: 'ReplicationConstraintStatsTable',
  44: 'ReplicationStatsTable',
  45: 'ReplicationCriticalLocalitiesTable',
  46: 'TenantTasksTable',
  47: 'ActivityTable',
  48: 'SystemTransactionActivityTable',
  49: 'SystemStatementActivityTable',
  50: 'ActivityUpdateJobTable',
  51: 'MVCCStatisticsTable'
};

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  let i = offset;

  while (i < bytes.length) {
    const byte = bytes[i++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
  }

  return [value, i];
}

function bytesToString(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(bytes);
}

function decodeTableKey(bytes: Uint8Array, offset: number): DecodedKey | null {
  if (offset >= bytes.length) return null;

  const parts: KeyPart[] = [];
  let pos = offset;

  // Handle empty key
  if (bytes.length === 0) {
    return {
      raw: '',
      pretty: '/Min',
      parts: [{ type: 'boundary', value: 'Min', raw: 'Min' }]
    };
  }

  // Handle single-byte keys
  if (bytes.length === 1) {
    const byte = bytes[0];

    // CRDB's key space interpretation:
    // 0x88-0xa6: Table IDs (0-30)
    // 0xa7: /Max boundary
    // 0xa8-0xf5: Table IDs (32-109)
    // 0xf6: /109/PrefixEnd
    // 0xf7: /255/PrefixEnd

    if (byte >= 0x88 && byte <= 0xa5) {
      const tableId = byte - 0x88;
      return {
        raw: byte.toString(16).padStart(2, '0'),
        pretty: `/Table/${tableId}`,
        parts: [{ type: 'table', value: tableId, raw: `Table/${tableId}` }]
      };
    } else if (byte === 0xa6) {
      // Special case: NamespaceTable/30
      return {
        raw: byte.toString(16).padStart(2, '0'),
        pretty: '/NamespaceTable/30',
        parts: [{ type: 'table', value: 30, raw: 'NamespaceTable/30' }]
      };
    } else if (byte === 0xa7) {
      return {
        raw: byte.toString(16).padStart(2, '0'),
        pretty: '/NamespaceTable/Max',
        parts: [{ type: 'boundary', value: 'Max', raw: 'NamespaceTable/Max' }]
      };
    } else if (byte >= 0xa8 && byte <= 0xf5) {
      const tableId = byte - 0x88;
      return {
        raw: byte.toString(16).padStart(2, '0'),
        pretty: `/Table/${tableId}`,
        parts: [{ type: 'table', value: tableId, raw: `Table/${tableId}` }]
      };
    } else if (byte === 0xf6) {
      return {
        raw: byte.toString(16).padStart(2, '0'),
        pretty: '/Table/109/PrefixEnd',
        parts: [{ type: 'table', value: 109, raw: 'Table/109/PrefixEnd' }]
      };
    } else if (byte === 0xf7) {
      return {
        raw: byte.toString(16).padStart(2, '0'),
        pretty: '/Table/255/PrefixEnd',
        parts: [{ type: 'table', value: 255, raw: 'Table/255/PrefixEnd' }]
      };
    }

    // Default for other single bytes
    return {
      raw: byte.toString(16).padStart(2, '0'),
      pretty: `/${byte}`,
      parts: [{ type: 'value', value: byte, raw: byte.toString() }]
    };
  }

  // Handle two-byte keys starting with 0xf6 or 0xf7
  if (bytes.length === 2 && (bytes[0] === 0xf6 || bytes[0] === 0xf7)) {
    const firstByte = bytes[0];
    const secondByte = bytes[1];

    if (firstByte === 0xf6) {
      // 0xf6 followed by a byte: interpret as table ID
      const tableId = secondByte;
      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: `/Table/${tableId}`,
        parts: [{ type: 'table', value: tableId, raw: `Table/${tableId}` }]
      };
    } else if (firstByte === 0xf7) {
      // 0xf7 followed by a byte: calculate table ID with PrefixEnd
      // Pattern: (secondByte << 8) - 1
      const tableId = (secondByte << 8) - 1;
      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: `/Table/${tableId}/PrefixEnd`,
        parts: [{ type: 'table', value: tableId, raw: `Table/${tableId}/PrefixEnd` }]
      };
    }
  }

  // Check for meta range keys (0x04)
  if (bytes[pos] === 0x04) {
    pos++;

    // Special meta keys
    const remaining = bytes.slice(pos);
    const remainingHex = Array.from(remaining).map(b => b.toString(16).padStart(2, '0')).join('');

    // Known patterns from CRDB
    if (remainingHex === '006c6976656e6573732d') {
      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: '/System/NodeLiveness',
        parts: [{ type: 'system', value: 'NodeLiveness', raw: 'System/NodeLiveness' }]
      };
    } else if (remainingHex === '006c6976656e6573732e') {
      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: '/System/NodeLivenessMax',
        parts: [{ type: 'system', value: 'NodeLivenessMax', raw: 'System/NodeLivenessMax' }]
      };
    } else if (remainingHex === '747364') {
      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: '/System/tsd',
        parts: [{ type: 'system', value: 'tsd', raw: 'System/tsd' }]
      };
    } else if (remainingHex === '747365') {
      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: '/System/tse',
        parts: [{ type: 'system', value: 'tse', raw: 'System/tse' }]
      };
    } else if (remainingHex === 'ff7379732d73636667') {
      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: '/System/SystemSpanConfigKeys',
        parts: [{ type: 'system', value: 'SystemSpanConfigKeys', raw: 'System/SystemSpanConfigKeys' }]
      };
    }

    // Try to extract ASCII string
    let asciiEnd = pos;
    while (asciiEnd < bytes.length && bytes[asciiEnd] >= 32 && bytes[asciiEnd] <= 126) {
      asciiEnd++;
    }

    if (asciiEnd > pos) {
      const metaKey = bytesToString(bytes.slice(pos, asciiEnd));
      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: `/meta/${metaKey}`,
        parts: [{ type: 'meta', value: metaKey, raw: `meta/${metaKey}` }]
      };
    }
  }

  // Check for table keys (0x12)
  if (bytes[pos] === 0x12) {
    pos++;
    const [tableId, newPos] = readVarint(bytes, pos);
    pos = newPos;

    const tableName = SYSTEM_TABLES[tableId] || `Table${tableId}`;
    parts.push({ type: 'table', value: tableId, raw: tableName });

    if (pos < bytes.length && bytes[pos] === 0x13) {
      pos++;
      const [indexId, newPos2] = readVarint(bytes, pos);
      pos = newPos2;
      parts.push({ type: 'index', value: indexId });

      while (pos < bytes.length && bytes[pos] === 0x12) {
        pos++;
        const endPos = bytes.indexOf(0x00, pos);
        if (endPos === -1) break;

        const columnValue = bytesToString(bytes.slice(pos, endPos));
        parts.push({ type: 'column', value: columnValue });
        pos = endPos + 1;
      }
    }
  }

  if (parts.length === 0) return null;

  const prettyParts = parts.map(p => {
    switch (p.type) {
      case 'meta': return `/${p.raw}`;
      case 'table': return `/${p.raw}`;
      case 'index': return `/Index${p.value}`;
      case 'column': return `/${p.value}`;
      default: return `/${p.value}`;
    }
  });

  return {
    raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
    pretty: prettyParts.join(''),
    parts
  };
}

export function prettyKey(hexString: string): DecodedKey {
  const originalValue = hexString;

  // Handle \x prefix (PostgreSQL/CRDB hex format)
  // Replace all \x occurrences, not just the first one
  hexString = hexString.replace(/\\x/gi, '').replace(/^0x/i, '').replace(/\s/g, '');

  // Handle empty key (just \x or empty string)
  if (hexString.length === 0) {
    return {
      raw: '',
      pretty: '/Min',
      parts: [{ type: 'boundary', value: 'Min', raw: 'Min' }]
    };
  }

  if (hexString.length % 2 !== 0) {
    return {
      raw: hexString,
      pretty: `<invalid hex: ${hexString}>`,
      parts: []
    };
  }

  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }

  const decoded = decodeTableKey(bytes, 0);
  if (decoded) {
    return decoded;
  }

  const asciiChars = Array.from(bytes)
    .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
    .join('');

  return {
    raw: hexString,
    pretty: asciiChars.includes('.') ? originalValue : asciiChars,
    parts: []
  };
}

export function isProbablyHexKey(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  // Handle \x prefix (PostgreSQL/CRDB hex format) - always treat as hex
  if (value.startsWith('\\x')) {
    const cleaned = value.replace(/^\\x/i, '').replace(/\s/g, '');
    // Even empty \x or single bytes with \x prefix are valid keys
    return cleaned.length >= 0 && cleaned.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(cleaned);
  }

  // For non-\x prefixed values, apply stricter rules
  const cleaned = value.replace(/^0x/i, '').replace(/\s/g, '');

  if (cleaned.length < 4 || cleaned.length % 2 !== 0) return false;

  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return false;

  // Check for CRDB key prefixes
  if (cleaned.startsWith('12') || cleaned.startsWith('f2') || cleaned.startsWith('04')) {
    return true;
  }

  const nonHexChars = cleaned.replace(/[0-9a-f]/gi, '').length;
  return nonHexChars === 0 && cleaned.length >= 8;
}