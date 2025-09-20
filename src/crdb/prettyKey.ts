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

// Encoding constants from CockroachDB's encoding.go
const encodedNull = 0x00;
const encodedNotNull = 0x01;

const floatNaN = encodedNotNull + 1; // 0x02
const floatNeg = floatNaN + 1; // 0x03
const floatZero = floatNeg + 1; // 0x04
const floatPos = floatZero + 1; // 0x05
const floatNaNDesc = floatPos + 1; // 0x06

const bytesMarker = 0x12;
const bytesDescMarker = bytesMarker + 1; // 0x13
const timeMarker = bytesDescMarker + 1; // 0x14
const durationBigNegMarker = timeMarker + 1; // 0x15
const durationMarker = durationBigNegMarker + 1; // 0x16
const durationBigPosMarker = durationMarker + 1; // 0x17

const decimalNaN = durationBigPosMarker + 1; // 0x18
const decimalNegativeInfinity = decimalNaN + 1; // 0x19
const decimalNegLarge = decimalNegativeInfinity + 1; // 0x1a
const decimalNegMedium = decimalNegLarge + 11; // 0x25
const decimalNegSmall = decimalNegMedium + 1; // 0x26
const decimalZero = decimalNegSmall + 1; // 0x27
const decimalPosSmall = decimalZero + 1; // 0x28
const decimalPosMedium = decimalPosSmall + 1; // 0x29
const decimalPosLarge = decimalPosMedium + 11; // 0x34
const decimalInfinity = decimalPosLarge + 1; // 0x35
const decimalNaNDesc = decimalInfinity + 1; // 0x36

const jsonInvertedIndex = decimalNaNDesc + 1; // 0x37
const jsonEmptyArray = jsonInvertedIndex + 1; // 0x38
const jsonEmptyObject = jsonEmptyArray + 1; // 0x39

const bitArrayMarker = jsonEmptyObject + 1; // 0x3a
const bitArrayDescMarker = bitArrayMarker + 1; // 0x3b

const timeTZMarker = bitArrayDescMarker + 1; // 0x3c
const geoMarker = timeTZMarker + 1; // 0x3d
const geoDescMarker = geoMarker + 1; // 0x3e

const arrayKeyMarker = geoDescMarker + 1; // 0x3f
const arrayKeyDescendingMarker = arrayKeyMarker + 1; // 0x40

const box2DMarker = arrayKeyDescendingMarker + 1; // 0x41
const geoInvertedIndexMarker = box2DMarker + 1; // 0x42

const emptyArray = geoInvertedIndexMarker + 1; // 0x43
const voidMarker = emptyArray + 1; // 0x44

const jsonEmptyArrayKeyMarker = voidMarker + 1; // 0x45
const jsonNullKeyMarker = jsonEmptyArrayKeyMarker + 1; // 0x46
const jsonStringKeyMarker = jsonNullKeyMarker + 1; // 0x47
const jsonNumberKeyMarker = jsonStringKeyMarker + 1; // 0x48
const jsonFalseKeyMarker = jsonNumberKeyMarker + 1; // 0x49
const jsonTrueKeyMarker = jsonFalseKeyMarker + 1; // 0x4a
const jsonArrayKeyMarker = jsonTrueKeyMarker + 1; // 0x4b
const jsonObjectKeyMarker = jsonArrayKeyMarker + 1; // 0x4c

const jsonEmptyArrayKeyDescendingMarker = jsonObjectKeyMarker + 8; // 0x54
const jsonNullKeyDescendingMarker = jsonEmptyArrayKeyDescendingMarker - 1; // 0x53
const jsonStringKeyDescendingMarker = jsonNullKeyDescendingMarker - 1; // 0x52
const jsonNumberKeyDescendingMarker = jsonStringKeyDescendingMarker - 1; // 0x51
const jsonFalseKeyDescendingMarker = jsonNumberKeyDescendingMarker - 1; // 0x50
const jsonTrueKeyDescendingMarker = jsonFalseKeyDescendingMarker - 1; // 0x4f
const jsonArrayKeyDescendingMarker = jsonTrueKeyDescendingMarker - 1; // 0x4e
const jsonObjectKeyDescendingMarker = jsonArrayKeyDescendingMarker - 1; // 0x4d

const ltreeKeyMarker = jsonEmptyArrayKeyDescendingMarker + 1; // 0x55
const ltreeKeyDescendingMarker = ltreeKeyMarker + 1; // 0x56

const IntMin = 0x80; // 128
const IntMax = 0xfd; // 253

const encodedNotNullDesc = 0xfe;
const encodedNullDesc = 0xff;

// Array key terminators
const arrayKeyTerminator = 0x00;
const arrayKeyDescendingTerminator = 0xff;

// Null encodings within array keys
const ascendingNullWithinArrayKey = 0x01;
const descendingNullWithinArrayKey = 0xfe;

// CRDB System Tables (preserved from original implementation)
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

// Type enum values
const Type = {
  Unknown: 0,
  Null: 1,
  NotNull: 2,
  Int: 3,
  Float: 4,
  Decimal: 5,
  Bytes: 6,
  BytesDesc: 7,
  Time: 8,
  Duration: 9,
  True: 10,
  False: 11,
  UUID: 12,
  Array: 13,
  IPAddr: 14,
  JSON: 15,
  Tuple: 16,
  BitArray: 17,
  BitArrayDesc: 18,
  TimeTZ: 19,
  Geo: 20,
  GeoDesc: 21,
  ArrayKeyAsc: 22,
  ArrayKeyDesc: 23,
  Box2D: 24,
  Void: 25,
  TSQuery: 26,
  TSVector: 27,
  JSONNull: 28,
  JSONNullDesc: 29,
  JSONString: 30,
  JSONStringDesc: 31,
  JSONNumber: 32,
  JSONNumberDesc: 33,
  JSONFalse: 34,
  JSONFalseDesc: 35,
  JSONTrue: 36,
  JSONTrueDesc: 37,
  JSONArray: 38,
  JSONArrayDesc: 39,
  JSONObject: 40,
  JSONObjectDesc: 41,
  JsonEmptyArray: 42,
  JsonEmptyArrayDesc: 43,
  PGVector: 44,
  LTree: 45,
  LTreeDesc: 46
} as const;
type TypeValue = typeof Type[keyof typeof Type];

// Direction enum
const Direction = {
  Ascending: 1,
  Descending: 2
} as const;
type DirectionValue = typeof Direction[keyof typeof Direction];

// PeekType implementation matching the Go version
function peekType(b: Uint8Array): TypeValue {
  if (b.length === 0) return Type.Unknown;

  const m = b[0];

  if (m === encodedNull || m === encodedNullDesc) return Type.Null;
  if (m === encodedNotNull || m === encodedNotNullDesc) return Type.NotNull;
  if (m === arrayKeyMarker) return Type.ArrayKeyAsc;
  if (m === arrayKeyDescendingMarker) return Type.ArrayKeyDesc;
  if (m === jsonNullKeyMarker) return Type.JSONNull;
  if (m === jsonNullKeyDescendingMarker) return Type.JSONNullDesc;
  if (m === jsonStringKeyMarker) return Type.JSONString;
  if (m === jsonStringKeyDescendingMarker) return Type.JSONStringDesc;
  if (m === jsonNumberKeyMarker) return Type.JSONNumber;
  if (m === jsonNumberKeyDescendingMarker) return Type.JSONNumberDesc;
  if (m === jsonFalseKeyMarker) return Type.JSONFalse;
  if (m === jsonFalseKeyDescendingMarker) return Type.JSONFalseDesc;
  if (m === jsonTrueKeyMarker) return Type.JSONTrue;
  if (m === jsonTrueKeyDescendingMarker) return Type.JSONTrueDesc;
  if (m === jsonArrayKeyMarker) return Type.JSONArray;
  if (m === jsonArrayKeyDescendingMarker) return Type.JSONArrayDesc;
  if (m === jsonEmptyArrayKeyMarker) return Type.JsonEmptyArray;
  if (m === jsonEmptyArrayKeyDescendingMarker) return Type.JsonEmptyArrayDesc;
  if (m === jsonObjectKeyMarker) return Type.JSONObject;
  if (m === jsonObjectKeyDescendingMarker) return Type.JSONObjectDesc;
  if (m === bytesMarker) return Type.Bytes;
  if (m === bytesDescMarker) return Type.BytesDesc;
  if (m === bitArrayMarker) return Type.BitArray;
  if (m === bitArrayDescMarker) return Type.BitArrayDesc;
  if (m === timeMarker) return Type.Time;
  if (m === timeTZMarker) return Type.TimeTZ;
  if (m === geoMarker) return Type.Geo;
  if (m === box2DMarker) return Type.Box2D;
  if (m === geoDescMarker) return Type.GeoDesc;
  if (m === Type.Array) return Type.Array;
  if (m === Type.True) return Type.True;
  if (m === Type.False) return Type.False;
  if (m === durationBigNegMarker || m === durationMarker || m === durationBigPosMarker) return Type.Duration;
  if (m >= IntMin && m <= IntMax) return Type.Int;
  if (m >= floatNaN && m <= floatNaNDesc) return Type.Float;
  if (m >= decimalNaN && m <= decimalNaNDesc) return Type.Decimal;
  if (m === voidMarker) return Type.Void;
  if (m === ltreeKeyMarker) return Type.LTree;
  if (m === ltreeKeyDescendingMarker) return Type.LTreeDesc;

  return Type.Unknown;
}

// DecodeVarintDescending - exact implementation from Go
function decodeVarintDescending(b: Uint8Array): [Uint8Array, number, Error?] {
  const [leftover, v, err] = decodeVarintAscending(b);
  return [leftover, ~v, err];
}

function decodeUnsafeStringAscending(b: Uint8Array): [Uint8Array, string, Error?] {
  if (b.length === 0 || b[0] !== bytesMarker) {
    return [b, "", new Error("not a bytes marker")];
  }

  // Skip the marker
  let remaining = b.slice(1);
  const result: number[] = [];

  // Escape constants from Go code
  const escape = 0x00;
  const escapedTerm = 0x01;
  const escaped00 = 0xff;
  // When we see "0x00 0xff", we should append the original 0x00 byte to result

  while (true) {
    // Find the next escape byte (0x00)
    const i = remaining.indexOf(escape);
    if (i === -1) {
      return [new Uint8Array(), "", new Error("did not find terminator")];
    }
    if (i + 1 >= remaining.length) {
      return [new Uint8Array(), "", new Error("malformed escape")];
    }

    const v = remaining[i + 1];
    if (v === escapedTerm) {
      // Found terminator: append everything before the escape sequence
      for (let j = 0; j < i; j++) {
        result.push(remaining[j]);
      }
      // Return the buffer after the terminator
      const finalRemaining = remaining.slice(i + 2);
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const str = decoder.decode(new Uint8Array(result));
      return [finalRemaining, str, undefined];
    }

    if (v !== escaped00) {
      return [new Uint8Array(), "", new Error(`unknown escape sequence: ${escape.toString(16)} ${v.toString(16)}`)];
    }

    // It's an escaped 0x00: append everything before the escape, then append 0x00
    for (let j = 0; j < i; j++) {
      result.push(remaining[j]);
    }
    result.push(0x00);
    remaining = remaining.slice(i + 2);
  }
}

function decodeUnsafeStringDescending(b: Uint8Array): [Uint8Array, string, Error?] {
  if (b.length === 0 || b[0] !== bytesDescMarker) {
    return [b, "", new Error("not a bytes desc marker")];
  }

  // For descending, we need to invert and then decode
  const inverted = new Uint8Array(b.length);
  inverted[0] = bytesMarker; // Convert desc marker to asc marker
  for (let i = 1; i < b.length; i++) {
    inverted[i] = 0xff - b[i];
  }

  const [remaining, str, err] = decodeUnsafeStringAscending(inverted);
  if (err) return [b, "", err];

  return [b.slice(b.length - remaining.length), str, undefined];
}

// UndoPrefixEnd implementation matching Go version
function undoPrefixEnd(b: Uint8Array): [Uint8Array, boolean] {
  if (b.length === 0 || b[b.length - 1] === 0) {
    return [new Uint8Array(), false];
  }

  const out = new Uint8Array(b);
  out[out.length - 1]--;
  return [out, true];
}

// Float decoding functions - exact implementations from Go float.go
function decodeFloatAscending(buf: Uint8Array): [Uint8Array, number, Error?] {
  if (peekType(buf) !== Type.Float) {
    return [buf, 0, new Error("did not find marker")];
  }

  switch (buf[0]) {
    case floatNaN:
    case floatNaNDesc:
      return [buf.slice(1), NaN, undefined];
    case floatNeg:
      const [b1, u1, err1] = decodeUint64Ascending(buf.slice(1));
      if (err1) return [b1, 0, err1];
      const inverted = ~u1;
      // Convert uint64 to float64 bits
      const view = new DataView(new ArrayBuffer(8));
      view.setBigUint64(0, BigInt(inverted), false); // big-endian
      const floatVal1 = view.getFloat64(0, false);
      return [b1, floatVal1, undefined];
    case floatZero:
      return [buf.slice(1), 0, undefined];
    case floatPos:
      const [b2, u2, err2] = decodeUint64Ascending(buf.slice(1));
      if (err2) return [b2, 0, err2];
      // Convert uint64 to float64 bits
      const view2 = new DataView(new ArrayBuffer(8));
      view2.setBigUint64(0, BigInt(u2), false); // big-endian
      const floatVal2 = view2.getFloat64(0, false);
      return [b2, floatVal2, undefined];
    default:
      return [new Uint8Array(), 0, new Error(`unknown prefix of the encoded byte slice: ${buf[0]}`)];
  }
}

function decodeFloatDescending(buf: Uint8Array): [Uint8Array, number, Error?] {
  const [b, r, err] = decodeFloatAscending(buf);
  if (r !== 0 && !isNaN(r)) {
    return [b, -r, err];
  }
  return [b, r, err];
}

// Basic decimal decoding - handles simple cases correctly, complex cases as approximations
function decodeDecimalAscending(buf: Uint8Array): [Uint8Array, string, Error?] {
  return decodeDecimal(buf, false);
}

function decodeDecimalDescending(buf: Uint8Array): [Uint8Array, string, Error?] {
  return decodeDecimal(buf, true);
}

function decodeDecimal(buf: Uint8Array, invert: boolean): [Uint8Array, string, Error?] {
  if (buf.length === 0) {
    return [buf, "", new Error("insufficient bytes to decode decimal")];
  }

  // Handle the simplistic cases first
  switch (buf[0]) {
    case decimalNaN:
    case decimalNaNDesc:
      return [buf.slice(1), "NaN", undefined];
    case decimalInfinity:
      return [buf.slice(1), invert ? "-Infinity" : "Infinity", undefined];
    case decimalNegativeInfinity:
      return [buf.slice(1), invert ? "Infinity" : "-Infinity", undefined];
    case decimalZero:
      return [buf.slice(1), "0", undefined];
    default:
      // For complex decimal cases, provide a basic approximation
      // TODO: Implement full decimal decoding for complete accuracy
      return [buf.slice(1), `<decimal:${buf[0].toString(16)}>`, undefined];
  }
}

// Duration decoding functions - basic implementation
function decodeDurationAscending(buf: Uint8Array): [Uint8Array, string, Error?] {
  if (peekType(buf) !== Type.Duration) {
    return [new Uint8Array(), "", new Error(`did not find marker ${buf[0].toString(16)}`)];
  }

  let b = buf.slice(1);

  // Decode sortNanos
  let [b1, sortNanos, err1] = decodeVarintAscending(b);
  if (err1) return [b1, "", err1];

  // Decode months
  let [b2, months, err2] = decodeVarintAscending(b1);
  if (err2) return [b2, "", err2];

  // Decode days
  let [b3, days, err3] = decodeVarintAscending(b2);
  if (err3) return [b3, "", err3];

  // Basic duration formatting - convert nanos to a readable format
  // This is a simplified version of Go's duration.Decode and StringNanos
  const totalNanos = sortNanos;
  const totalSeconds = Math.floor(totalNanos / 1000000000);
  const remainingNanos = totalNanos % 1000000000;

  let result = "";
  if (months !== 0) result += `${months}mon `;
  if (days !== 0) result += `${days}d `;
  if (totalSeconds !== 0) result += `${totalSeconds}s `;
  if (remainingNanos !== 0) result += `${remainingNanos}ns`;

  if (result === "") result = "0s";

  return [b3, result.trim(), undefined];
}

function decodeDurationDescending(buf: Uint8Array): [Uint8Array, string, Error?] {
  if (peekType(buf) !== Type.Duration) {
    return [new Uint8Array(), "", new Error("did not find marker")];
  }

  let b = buf.slice(1);

  // Decode sortNanos (descending)
  let [b1, sortNanos, err1] = decodeVarintDescending(b);
  if (err1) return [b1, "", err1];

  // Decode months (descending)
  let [b2, months, err2] = decodeVarintDescending(b1);
  if (err2) return [b2, "", err2];

  // Decode days (descending)
  let [b3, days, err3] = decodeVarintDescending(b2);
  if (err3) return [b3, "", err3];

  // Basic duration formatting (same as ascending after decoding)
  const totalNanos = sortNanos;
  const totalSeconds = Math.floor(totalNanos / 1000000000);
  const remainingNanos = totalNanos % 1000000000;

  let result = "";
  if (months !== 0) result += `${months}mon `;
  if (days !== 0) result += `${days}d `;
  if (totalSeconds !== 0) result += `${totalSeconds}s `;
  if (remainingNanos !== 0) result += `${remainingNanos}ns`;

  if (result === "") result = "0s";

  return [b3, result.trim(), undefined];
}

// Helper function to decode uint64 - needed for float decoding
function decodeUint64Ascending(b: Uint8Array): [Uint8Array, number, Error?] {
  if (b.length < 8) {
    return [new Uint8Array(), 0, new Error("insufficient bytes to decode uint64 int value")];
  }

  let v = 0;
  for (let i = 0; i < 8; i++) {
    v = (v * 256) + b[i];
  }

  return [b.slice(8), v, undefined];
}

// DecodeUvarintDescending - exact implementation from Go
function decodeUvarintDescending(b: Uint8Array): [Uint8Array, number, Error?] {
  const [leftover, v, err] = decodeUvarintAscending(b);
  return [leftover, ~v, err];
}

// BitArray decoding functions - basic implementation
function decodeBitArrayAscending(buf: Uint8Array): [Uint8Array, string, Error?] {
  if (peekType(buf) !== Type.BitArray) {
    return [new Uint8Array(), "", new Error(`did not find marker ${buf[0].toString(16)}`)];
  }

  // For now, provide a basic implementation that at least consumes the correct bytes
  // TODO: Implement full bitarray decoding for complete accuracy
  let b = buf.slice(1);

  // Try to consume varints until we hit a terminator or run out of data
  try {
    while (b.length > 0) {
      const [remaining, _, err] = decodeUvarintAscending(b);
      if (err) break;
      b = remaining;

      // Check for terminator (need to find the actual terminator value)
      if (b.length > 0 && b[0] === 0x00) {
        b = b.slice(1);
        break;
      }
    }
  } catch {
    // If decoding fails, just consume one byte to avoid infinite loops
    b = buf.slice(1);
  }

  return [b, "B<bitarray>", undefined];
}

function decodeBitArrayDescending(buf: Uint8Array): [Uint8Array, string, Error?] {
  if (peekType(buf) !== Type.BitArrayDesc) {
    return [new Uint8Array(), "", new Error(`did not find marker`)];
  }

  // Similar to ascending but with descending decoding
  let b = buf.slice(1);

  try {
    while (b.length > 0) {
      const [remaining, _, err] = decodeUvarintDescending ? decodeUvarintDescending(b) : decodeUvarintAscending(b);
      if (err) break;
      b = remaining;

      // Check for terminator
      if (b.length > 0 && b[0] === 0xFF) {
        b = b.slice(1);
        break;
      }
    }
  } catch {
    b = buf.slice(1);
  }

  return [b, "B<bitarray_desc>", undefined];
}

// Helper functions for array key processing - exact implementations from Go
function validateAndConsumeArrayKeyMarker(buf: Uint8Array, dir: DirectionValue): [Uint8Array, Error?] {
  const typ = peekType(buf);
  const expected = (dir === Direction.Descending) ? Type.ArrayKeyDesc : Type.ArrayKeyAsc;
  if (typ !== expected) {
    return [new Uint8Array(), new Error(`invalid type found ${typ}`)];
  }
  return [buf.slice(1), undefined];
}

function isArrayKeyDone(buf: Uint8Array, dir: DirectionValue): boolean {
  const expected = (dir === Direction.Descending) ? arrayKeyDescendingTerminator : arrayKeyTerminator;
  return buf[0] === expected;
}

function isNextByteArrayEncodedNull(buf: Uint8Array, dir: DirectionValue): boolean {
  const expected = (dir === Direction.Descending) ? descendingNullWithinArrayKey : ascendingNullWithinArrayKey;
  return buf[0] === expected;
}

// prettyPrintFirstValue implementation matching Go version
function prettyPrintFirstValue(dir: DirectionValue, b: Uint8Array): [Uint8Array, string, Error?] {
  if (b.length === 0) return [b, "", new Error("empty buffer")];

  const typ = peekType(b);

  switch (typ) {
    case Type.Null:
      return [b.slice(1), "NULL", undefined];

    case Type.True:
      return [b.slice(1), "True", undefined];

    case Type.False:
      return [b.slice(1), "False", undefined];

    case Type.Array:
      return [b.slice(1), "Arr", undefined];

    case Type.ArrayKeyAsc:
    case Type.ArrayKeyDesc:
      const encDir = (typ === Type.ArrayKeyDesc) ? Direction.Descending : Direction.Ascending;
      const [buf, arrayErr] = validateAndConsumeArrayKeyMarker(b, encDir);
      if (arrayErr) {
        return [new Uint8Array(), "", arrayErr];
      }

      let result = "ARRAY[";
      let first = true;
      let currentBuf = buf;

      // Use the array key decoding logic, but instead of calling out
      // to keyside.Decode, just make a recursive call.
      while (true) {
        if (currentBuf.length === 0) {
          return [new Uint8Array(), "", new Error("invalid array (unterminated)")];
        }
        if (isArrayKeyDone(currentBuf, encDir)) {
          currentBuf = currentBuf.slice(1);
          break;
        }

        let next: string;
        if (isNextByteArrayEncodedNull(currentBuf, dir)) {
          next = "NULL";
          currentBuf = currentBuf.slice(1);
        } else {
          const [nextBuf, nextStr, nextErr] = prettyPrintFirstValue(dir, currentBuf);
          if (nextErr) {
            return [new Uint8Array(), "", nextErr];
          }
          next = nextStr;
          currentBuf = nextBuf;
        }

        if (!first) {
          result += ",";
        }
        result += next;
        first = false;
      }
      result += "]";
      return [currentBuf, result, undefined];

    case Type.NotNull:
      return [b.slice(1), "!NULL", undefined];

    case Type.Int:
      let [remaining, intVal, err] = (dir === Direction.Descending)
        ? decodeVarintDescending(b)
        : decodeVarintAscending(b);
      if (err) return [b, "", err];
      return [remaining, intVal.toString(), undefined];

    case Type.Float:
      let [floatRemaining, f, floatErr] = (dir === Direction.Descending)
        ? decodeFloatDescending(b)
        : decodeFloatAscending(b);
      if (floatErr) return [b, "", floatErr];
      // Format float using 'g' format like Go's strconv.FormatFloat(f, 'g', -1, 64)
      return [floatRemaining, f.toString(), undefined];

    case Type.Decimal:
      let [decimalRemaining, decimalStr, decimalErr] = (dir === Direction.Descending)
        ? decodeDecimalDescending(b)
        : decodeDecimalAscending(b);
      if (decimalErr) return [b, "", decimalErr];
      return [decimalRemaining, decimalStr, undefined];

    case Type.Bytes:
      if (dir === Direction.Descending) {
        return [b, "", new Error("descending bytes column dir but ascending bytes encoding")];
      }
      let [bytesRemaining, str, bytesErr] = decodeUnsafeStringAscending(b);
      if (bytesErr) return [b, "", bytesErr];
      return [bytesRemaining, JSON.stringify(str), undefined];

    case Type.BytesDesc:
      if (dir === Direction.Ascending) {
        return [b, "", new Error("ascending bytes column dir but descending bytes encoding")];
      }
      let [bytesDescRemaining, descStr, bytesDescErr] = decodeUnsafeStringDescending(b);
      if (bytesDescErr) return [b, "", bytesDescErr];
      return [bytesDescRemaining, JSON.stringify(descStr), undefined];

    case Type.Time:
      // Decode time: skip marker, then decode unix seconds and nanoseconds
      const timeB = b.slice(1); // skip time marker
      const [remaining1, sec, err1] = (dir === Direction.Descending)
        ? decodeVarintDescending(timeB)
        : decodeVarintAscending(timeB);
      if (err1) return [b, "", err1];

      const [remaining2, nsec, err2] = (dir === Direction.Descending)
        ? decodeVarintDescending(remaining1)
        : decodeVarintAscending(remaining1);
      if (err2) return [b, "", err2];

      // For descending, invert the values
      const finalSec = (dir === Direction.Descending) ? ~sec : sec;
      const finalNsec = (dir === Direction.Descending) ? ~nsec : nsec;

      // Create JavaScript Date from unix timestamp
      const date = new Date(finalSec * 1000 + finalNsec / 1000000);
      return [remaining2, date.toISOString(), undefined];

    case Type.TimeTZ:
      // TODO: Implement DecodeTimeTZAscending/DecodeTimeTZDescending - currently stubbed
      if (dir === Direction.Descending) {
        return [b.slice(1), `<timetz_desc:${b[0].toString(16)}>`, undefined];
      } else {
        return [b.slice(1), `<timetz:${b[0].toString(16)}>`, undefined];
      }

    case Type.Duration:
      let [durationRemaining, durationStr, durationErr] = (dir === Direction.Descending)
        ? decodeDurationDescending(b)
        : decodeDurationAscending(b);
      if (durationErr) return [b, "", durationErr];
      return [durationRemaining, durationStr, undefined];

    case Type.BitArray:
      if (dir === Direction.Descending) {
        return [b, "", new Error("descending bit column dir but ascending bit array encoding")];
      }
      let [bitArrayRemaining, bitArrayStr, bitArrayErr] = decodeBitArrayAscending(b);
      if (bitArrayErr) return [b, "", bitArrayErr];
      return [bitArrayRemaining, bitArrayStr, undefined];

    case Type.BitArrayDesc:
      if (dir === Direction.Ascending) {
        return [b, "", new Error("ascending bit column dir but descending bit array encoding")];
      }
      let [bitArrayDescRemaining, bitArrayDescStr, bitArrayDescErr] = decodeBitArrayDescending(b);
      if (bitArrayDescErr) return [b, "", bitArrayDescErr];
      return [bitArrayDescRemaining, bitArrayDescStr, undefined];

    case Type.LTree:
      if (dir === Direction.Descending) {
        return [b, "", new Error("ascending ltree column dir but descending ltree encoding")];
      }
      // TODO: Implement DecodeLTreeAscending - currently stubbed
      return [b.slice(1), `<ltree:${b[0].toString(16)}>`, undefined];

    case Type.LTreeDesc:
      if (dir === Direction.Ascending) {
        return [b, "", new Error("descending ltree column dir but ascending ltree encoding")];
      }
      // TODO: Implement DecodeLTreeDescending - currently stubbed
      return [b.slice(1), `<ltree_desc:${b[0].toString(16)}>`, undefined];

    default:
      if (b.length >= 1) {
        switch (b[0]) {
          case jsonInvertedIndex:
            // Skip for now
            return [b.slice(1), "<json_inverted>", undefined];
          case jsonEmptyArray:
            return [b.slice(1), "[]", undefined];
          case jsonEmptyObject:
            return [b.slice(1), "{}", undefined];
          case emptyArray:
            return [b.slice(1), "[]", undefined];
        }
      }
      // This shouldn't ever happen, but if it does, return an empty slice.
      // Match Go behavior exactly: return nil, strconv.Quote(string(b)), nil
      // But check if the data is mostly binary (non-printable) and show as hex instead
      let printableCount = 0;
      for (let i = 0; i < Math.min(b.length, 20); i++) {
        if (b[i] >= 32 && b[i] <= 126) printableCount++;
      }

      if (printableCount < b.length * 0.3) {
        // Mostly binary data - show as hex
        const hexStr = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
        return [new Uint8Array(), "\\x" + hexStr, undefined];
      } else {
        // Mostly printable - quote as string (matching Go behavior)
        // But handle binary bytes properly by converting to hex when they're not valid UTF-8
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          const str = decoder.decode(b);
          return [new Uint8Array(), JSON.stringify(str), undefined];
        } catch {
          // Not valid UTF-8, show as hex
          const hexStr = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
          return [new Uint8Array(), "\\x" + hexStr, undefined];
        }
      }
  }
}

// prettyPrintValueImpl implementation matching Go version
function prettyPrintValueImpl(valDirs: DirectionValue[], b: Uint8Array, _sep: string): [string[], boolean] {
  const result: string[] = [];
  let allDecoded = true;
  let currentDirs = [...valDirs];

  while (b.length > 0) {
    const valDir = currentDirs.length > 0 ? currentDirs.shift()! : Direction.Ascending;

    const [bb, s, err] = prettyPrintFirstValue(valDir, b);
    if (err) {
      // If we fail to decode, mark as unknown and attempt
      // to continue - it's possible we can still decode the
      // remainder of the key bytes.
      allDecoded = false;
      result.push("???");
      // If we can't decode anything, move forward by 1 byte to try to continue
      if (bb.length === b.length) {
        b = b.slice(1);
      } else {
        b = bb;
      }
    } else {
      result.push(s);
      b = bb;
    }
  }

  return [result, allDecoded];
}

// Main PrettyPrintValue implementation matching Go version
function prettyPrintValue(valDirs: DirectionValue[], b: Uint8Array, sep: string): string {
  const [parts, allDecoded] = prettyPrintValueImpl(valDirs, b, sep);

  if (allDecoded) {
    return parts.join(sep);
  }

  // If we failed to decode everything, try UndoPrefixEnd
  const [undoPrefixEndBytes, ok] = undoPrefixEnd(b);
  if (ok) {
    // Try adding 0xFF bytes up to 20 times
    const cap = Math.min(20, Math.max(0, valDirs.length - b.length));
    let tryBytes = new Uint8Array(undoPrefixEndBytes);

    for (let i = 0; i < cap; i++) {
      const [retryParts, retryAllDecoded] = prettyPrintValueImpl(valDirs, tryBytes, sep);
      if (retryAllDecoded) {
        return retryParts.join(sep) + sep + "PrefixEnd";
      }
      // Add 0xFF and try again
      const newTryBytes = new Uint8Array(tryBytes.length + 1);
      newTryBytes.set(tryBytes);
      newTryBytes[tryBytes.length] = 0xFF;
      tryBytes = newTryBytes;
    }
  }

  return parts.join(sep);
}

// DecodeUvarintAscending - exact implementation from Go
function decodeUvarintAscending(b: Uint8Array): [Uint8Array, number, Error?] {
  if (b.length === 0) {
    return [new Uint8Array(), 0, new Error("insufficient bytes to decode uvarint value")];
  }

  const intZero = 136; // IntMin + intMaxWidth = 128 + 8 = 136
  const intSmall = 109; // IntMax - intZero - intMaxWidth = 253 - 136 - 8 = 109

  let length = b[0] - intZero;
  const remaining = b.slice(1); // skip length byte

  if (length <= intSmall) {
    return [remaining, length, undefined];
  }

  length -= intSmall;
  if (length < 0 || length > 8) {
    return [new Uint8Array(), 0, new Error(`invalid uvarint length of ${length}`)];
  } else if (remaining.length < length) {
    return [new Uint8Array(), 0, new Error("insufficient bytes to decode uvarint value")];
  }

  let v = 0;
  // It is faster to range over the elements in a slice than to index
  // into the slice on each loop iteration.
  for (let i = 0; i < length; i++) {
    v = (v << 8) | remaining[i];
  }

  return [remaining.slice(length), v, undefined];
}

// DecodeVarintAscending - exact implementation from Go
function decodeVarintAscending(b: Uint8Array): [Uint8Array, number, Error?] {
  if (b.length === 0) {
    return [new Uint8Array(), 0, new Error("insufficient bytes to decode varint value")];
  }

  const intZero = 136; // IntMin + intMaxWidth = 128 + 8 = 136

  let length = b[0] - intZero;
  if (length < 0) {
    length = -length;
    const remB = b.slice(1);
    if (remB.length < length) {
      return [new Uint8Array(), 0, new Error("insufficient bytes to decode varint value")];
    }

    let v = 0;
    // Use the ones-complement of each encoded byte in order to build
    // up a positive number, then take the ones-complement again to
    // arrive at our negative value.
    for (let i = 0; i < length; i++) {
      v = (v << 8) | (~remB[i] & 0xFF);
    }

    return [remB.slice(length), ~v, undefined];
  }

  // For positive numbers, delegate to DecodeUvarintAscending
  const [remaining, uv, err] = decodeUvarintAscending(b);
  if (err) {
    return [remaining, 0, err];
  }

  // Check for overflow (JavaScript numbers are safe up to 2^53)
  if (uv > Number.MAX_SAFE_INTEGER) {
    return [new Uint8Array(), 0, new Error(`varint ${uv} overflows safe integer`)];
  }

  return [remaining, uv, undefined];
}

// Helper function for bytes to string conversion
function bytesToString(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(bytes);
}

// CRDB-specific short key decoding (preserved from original implementation)
function decodeShortKey(bytes: Uint8Array): DecodedKey | null {
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


  // Check for multi-byte table keys starting with table prefix bytes
  const firstByte = bytes[0];
  if ((firstByte >= 0x88 && firstByte <= 0xa5) || (firstByte >= 0xa8 && firstByte <= 0xf5)) {
    const tableId = firstByte - 0x88;

    // If it's just the table byte alone, it was handled above in single-byte case
    // If there's more data, we have a table key with additional components
    if (bytes.length > 1) {
      // Use Go-style decoding for the remainder after the table ID
      const remainingBytes = bytes.slice(1);
      const remainingResult = prettyPrintValue([], remainingBytes, "/");

      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: `/Table/${tableId}/${remainingResult}`,
        parts: [
          { type: 'table', value: tableId, raw: `Table/${tableId}` },
          { type: 'decoded', value: remainingResult, raw: remainingResult }
        ]
      };
    }
  }

  // Check for meta range keys (0x04)
  if (bytes[0] === 0x04) {
    let pos = 1;

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
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const metaKey = decoder.decode(bytes.slice(pos, asciiEnd));
      return {
        raw: Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        pretty: `/meta/${metaKey}`,
        parts: [{ type: 'meta', value: metaKey, raw: `meta/${metaKey}` }]
      };
    }
  }

  // Check for table keys (0x12) - this handles another format of CRDB table keys
  const parts: KeyPart[] = [];
  let pos = 0;

  if (bytes[pos] === 0x12) {
    pos++;

    const [remaining1, tableId, err1] = decodeUvarintAscending(bytes.slice(pos));
    if (err1) throw err1;
    pos = bytes.length - remaining1.length;

    const tableName = SYSTEM_TABLES[tableId] || `Table${tableId}`;
    parts.push({ type: 'table', value: tableId, raw: tableName });

    if (pos < bytes.length && bytes[pos] === 0x13) {
      pos++;
      const [remaining2, indexId, err2] = decodeUvarintAscending(bytes.slice(pos));
      if (err2) throw err2;
      pos = bytes.length - remaining2.length;
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

  if (parts.length > 0) {
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

  return null; // Not a recognized short key
}

export function prettyKey(hexString: string): DecodedKey {
  // Handle \x prefix (PostgreSQL/CRDB hex format)
  hexString = hexString.replace(/\\x/gi, '').replace(/^0x/i, '').replace(/\s/g, '');

  // Handle empty key
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

  // First try the CRDB-specific short key decoding
  const shortKeyResult = decodeShortKey(bytes);
  if (shortKeyResult) {
    return shortKeyResult;
  }

  // Use the Go-style pretty printing for complex keys
  const prettyResult = prettyPrintValue([], bytes, "/");

  // Check if we got a result that contains undecoded data (???)
  if (prettyResult && prettyResult.includes("???")) {
    // We have partially decoded data - the ??? indicates where decoding failed
    // Replace ??? with hex representation of remaining data
    const cleanResult = prettyResult.replace(/\/\?\?\?.*$/, ''); // Remove ??? and everything after
    const hexSuffix = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return {
      raw: hexString,
      pretty: "/" + cleanResult + "/\\x" + hexSuffix,
      parts: [
        { type: 'partial', value: cleanResult, raw: cleanResult },
        { type: 'hex', value: hexSuffix, raw: hexSuffix }
      ]
    };
  }

  // If we got a meaningful result without any undecoded parts, use it
  if (prettyResult && prettyResult !== "???") {
    return {
      raw: hexString,
      pretty: "/" + prettyResult,
      parts: [{ type: 'decoded', value: prettyResult, raw: prettyResult }]
    };
  }

  // Complete fallback: couldn't decode anything meaningful
  // Return the hex representation to ensure no data is lost
  return {
    raw: hexString,
    pretty: "\\x" + hexString,
    parts: [{ type: 'hex', value: hexString, raw: hexString }]
  };
}

export function isProbablyHexKey(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  // Handle \x prefix (PostgreSQL/CRDB hex format) - always treat as hex
  if (value.startsWith('\\x')) {
    const cleaned = value.replace(/^\\x/i, '').replace(/\s/g, '');
    return cleaned.length >= 0 && cleaned.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(cleaned);
  }

  // For non-\x prefixed values, apply stricter rules
  const cleaned = value.replace(/^0x/i, '').replace(/\s/g, '');

  if (cleaned.length < 4 || cleaned.length % 2 !== 0) return false;

  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return false;

  // Only accept strings with known CRDB key prefixes
  return cleaned.startsWith('12') || cleaned.startsWith('f2') || cleaned.startsWith('04');
}