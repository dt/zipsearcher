// Registry mapping table/column combinations to protobuf message types
export interface ProtoColumnMapping {
  table: string;
  column: string;
  protoType: string;
  description?: string;
}

// Known CRDB system table proto mappings
export const PROTO_COLUMN_MAPPINGS: ProtoColumnMapping[] = [
  // system.span_configurations - various naming patterns
  {
    table: 'system_span_configurations',
    column: 'config',
    protoType: 'cockroach.roachpb.SpanConfig',
    description: 'Span configuration'
  },
  {
    table: 'system.span_configurations',
    column: 'config',
    protoType: 'cockroach.roachpb.SpanConfig',
    description: 'Span configuration'
  },
  {
    table: 'span_configurations',
    column: 'config',
    protoType: 'cockroach.roachpb.SpanConfig',
    description: 'Span configuration'
  },
  {
    table: 'system.span_configs',
    column: 'config',
    protoType: 'cockroach.roachpb.SpanConfig',
    description: 'Span configuration'
  },
  {
    table: 'span_configs',
    column: 'config',
    protoType: 'cockroach.roachpb.SpanConfig',
    description: 'Span configuration'
  },
  {
    table: 'system.span_config',
    column: 'config',
    protoType: 'cockroach.roachpb.SpanConfig',
    description: 'Span configuration'
  },
  {
    table: 'span_config',
    column: 'config',
    protoType: 'cockroach.roachpb.SpanConfig',
    description: 'Span configuration'
  },

  // system.zones
  {
    table: 'system.zones',
    column: 'config',
    protoType: 'cockroach.config.zonepb.ZoneConfig',
    description: 'Zone configuration'
  },
  {
    table: 'zones',
    column: 'config',
    protoType: 'cockroach.config.zonepb.ZoneConfig',
    description: 'Zone configuration'
  },

  // system.descriptors
  {
    table: 'system.descriptor',
    column: 'descriptor',
    protoType: 'cockroach.sql.sqlbase.Descriptor',
    description: 'Table/database/schema descriptor'
  },
  {
    table: 'system_descriptor',
    column: 'descriptor',
    protoType: 'cockroach.sql.sqlbase.Descriptor',
    description: 'Table/database/schema descriptor'
  },
  {
    table: 'descriptor',
    column: 'descriptor',
    protoType: 'cockroach.sql.sqlbase.Descriptor',
    description: 'Table/database/schema descriptor'
  },

  // system.jobs
  {
    table: 'system.jobs',
    column: 'payload',
    protoType: 'cockroach.sql.jobs.jobspb.Payload',
    description: 'Job payload'
  },
  {
    table: 'system.jobs',
    column: 'progress',
    protoType: 'cockroach.sql.jobs.jobspb.Progress',
    description: 'Job progress'
  },
  {
    table: 'system_jobs',
    column: 'payload',
    protoType: 'cockroach.sql.jobs.jobspb.Payload',
    description: 'Job payload'
  },
  {
    table: 'system_jobs',
    column: 'progress',
    protoType: 'cockroach.sql.jobs.jobspb.Progress',
    description: 'Job progress'
  },
  {
    table: 'jobs',
    column: 'payload',
    protoType: 'cockroach.sql.jobs.jobspb.Payload',
    description: 'Job payload'
  },
  {
    table: 'jobs',
    column: 'progress',
    protoType: 'cockroach.sql.jobs.jobspb.Progress',
    description: 'Job progress'
  },

  // system.job_info - dynamic based on info_key column
  {
    table: 'system.job_info',
    column: 'value',
    protoType: 'dynamic:job_info',
    description: 'Job info value (type depends on info_key)'
  },
  {
    table: 'system_job_info',
    column: 'value',
    protoType: 'dynamic:job_info',
    description: 'Job info value (type depends on info_key)'
  },
  {
    table: 'job_info',
    column: 'value',
    protoType: 'dynamic:job_info',
    description: 'Job info value (type depends on info_key)'
  },

  // system.lease
  {
    table: 'system.lease',
    column: 'lease',
    protoType: 'cockroach.roachpb.Lease',
    description: 'Range lease'
  },
  {
    table: 'lease',
    column: 'lease',
    protoType: 'cockroach.roachpb.Lease',
    description: 'Range lease'
  },

  // system.rangelog
  {
    table: 'system.rangelog',
    column: 'info',
    protoType: 'cockroach.kv.kvserver.storagepb.RangeLogEvent',
    description: 'Range event info'
  },
  {
    table: 'rangelog',
    column: 'info',
    protoType: 'cockroach.kv.kvserver.storagepb.RangeLogEvent',
    description: 'Range event info'
  },

  // system.replication_stats
  {
    table: 'system.replication_stats',
    column: 'report',
    protoType: 'cockroach.roachpb.ReplicationStatsReport',
    description: 'Replication statistics'
  },
  {
    table: 'replication_stats',
    column: 'report',
    protoType: 'cockroach.roachpb.ReplicationStatsReport',
    description: 'Replication statistics'
  }
];

// Find the proto type for a given table/column combination
export function findProtoType(tableName: string, columnName: string): ProtoColumnMapping | null {
  // Normalize names (remove file extensions and schema prefixes)
  let normalizedTable = tableName.toLowerCase();

  // Remove file extensions like .txt
  normalizedTable = normalizedTable.replace(/\.(txt|csv|tsv)$/, '');

  // Remove path prefixes like 'debug/'
  normalizedTable = normalizedTable.replace(/^.*\//, '');

  const normalizedColumn = columnName.toLowerCase();

  return PROTO_COLUMN_MAPPINGS.find(
    mapping =>
      (mapping.table.toLowerCase() === normalizedTable ||
       mapping.table.toLowerCase() === `system.${normalizedTable}`) &&
      mapping.column.toLowerCase() === normalizedColumn
  ) || null;
}

// Check if a value looks like protobuf data
export function looksLikeProtobuf(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  // Check for \x prefix with binary-looking data
  if (value.startsWith('\\x')) {
    const hex = value.slice(2);
    // Protobuf field tags:
    // 0x08 = field 1 varint
    // 0x0a = field 1 length-delimited (string/bytes/message)
    // 0x10 = field 2 varint
    // 0x12 = field 2 length-delimited
    // 0x18 = field 3 varint
    // 0x1a = field 3 length-delimited
    // etc.
    return /^(08|0a|10|12|18|1a|20|22|28|2a|30|32|38|3a|40|42|48|4a|50|52|58|5a)/.test(hex);
  }

  return false;
}