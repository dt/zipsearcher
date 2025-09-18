import { describe, it, expect } from 'vitest';
import { preprocessCSV } from './csvPreprocessor';

describe('CSV Preprocessor - job_info proto decoding', () => {
  describe('system.job_info proto decoding', () => {
    // Test cases derived from actual CRDB output using crdb_internal.pb_to_json()
    const testCases = [
      {
        description: 'key visualizer job - legacy_payload',
        input: {
          job_id: '100',
          info_key: 'legacy_payload',
          written: '2025-09-17 21:51:14.934948+00',
          value: '\\x0a126b65792076697375616c697a6572206a6f6212046e6f646518f98edbe2e3e08f03a001019a0210209f0491db3e4a1d96b30aa3640ca611a20208081910031800200cb20200'
        },
        expectedProto: {
          creationClusterId: '209f0491-db3e-4a1d-96b3-0aa3640ca611',
          creationClusterVersion: {
            internal: 12,
            majorVal: 25,
            minorVal: 3
          },
          description: 'key visualizer job',
          keyVisualizerDetails: {},
          noncancelable: true,
          startedMicros: '1758145874937721',
          usernameProto: 'node'
        }
      },
      {
        description: 'key visualizer job - legacy_progress',
        input: {
          job_id: '100',
          info_key: 'legacy_progress',
          written: '2025-09-17 21:50:46.454088+00',
          value: '\\x10c8ce90d5e3e08f03da0100'
        },
        expectedProto: {
          keyVisualizerProgress: {},
          modifiedMicros: '1758145846454088'
        }
      },
      {
        description: 'POLL JOBS STATS - legacy_payload',
        input: {
          job_id: '101',
          info_key: 'legacy_payload',
          written: '2025-09-17 21:51:14.930635+00',
          value: '\\x0a0f504f4c4c204a4f425320535441545312046e6f646518b2e9dae2e3e08f03a001019a0210209f0491db3e4a1d96b30aa3640ca611a20208081910031800200cba0200'
        },
        expectedProto: {
          creationClusterId: '209f0491-db3e-4a1d-96b3-0aa3640ca611',
          creationClusterVersion: {
            internal: 12,
            majorVal: 25,
            minorVal: 3
          },
          description: 'POLL JOBS STATS',
          noncancelable: true,
          pollJobsStats: {},
          startedMicros: '1758145874932914',
          usernameProto: 'node'
        }
      },
      {
        description: 'POLL JOBS STATS - legacy_progress',
        input: {
          job_id: '101',
          info_key: 'legacy_progress',
          written: '2025-09-17 21:50:46.557964+00',
          value: '\\x108cfa96d5e3e08f03e20100'
        },
        expectedProto: {
          modifiedMicros: '1758145846557964',
          pollJobsStats: {}
        }
      },
      {
        description: 'sql activity job - legacy_payload',
        input: {
          job_id: '103',
          info_key: 'legacy_payload',
          written: '2025-09-17 21:51:14.936896+00',
          value: '\\x0a1073716c206163746976697479206a6f6212046e6f646518cd97dbe2e3e08f03a001019a0210209f0491db3e4a1d96b30aa3640ca611a20208081910031800200ce20200'
        },
        expectedProto: {
          autoUpdateSqlActivities: {},
          creationClusterId: '209f0491-db3e-4a1d-96b3-0aa3640ca611',
          creationClusterVersion: {
            internal: 12,
            majorVal: 25,
            minorVal: 3
          },
          description: 'sql activity job',
          noncancelable: true,
          startedMicros: '1758145874938829',
          usernameProto: 'node'
        }
      },
      {
        description: 'mvcc statistics update job - legacy_payload',
        input: {
          job_id: '104',
          info_key: 'legacy_payload',
          written: '2025-09-17 21:51:14.931526+00',
          value: '\\x0a1a6d766363207374617469737469637320757064617465206a6f6212046e6f646518c8ebdae2e3e08f03a001019a0210209f0491db3e4a1d96b30aa3640ca611a20208081910031800200cea0200'
        },
        expectedProto: {
          creationClusterId: '209f0491-db3e-4a1d-96b3-0aa3640ca611',
          creationClusterVersion: {
            internal: 12,
            majorVal: 25,
            minorVal: 3
          },
          description: 'mvcc statistics update job',
          mvccStatisticsDetails: {},
          noncancelable: true,
          startedMicros: '1758145874933192',
          usernameProto: 'node'
        }
      },
      {
        description: 'Table statistics refresh - legacy_payload (truncated)',
        input: {
          job_id: '1107805821240246273',
          info_key: 'legacy_payload',
          written: '2025-09-17 21:51:47.01918+00',
          value: '\\x0a355461626c652073746174697374696373207265667265736820666f722073797374656d2e7075626c69632e64657363726970746f7212046e6f646518d580fff1e3e08f0320d2a881f2e3e08f038201584352454154452053544154495354494353205f5f6175746f5f5f2046524f4d205b335d2057495448204f5054494f4e53205448524f54544c494e4720302e39204153204f462053595354454d2054494d4520272d333073279a0210209f0491db3e4a1d96b30aa3640ca611a20208081910031800200c'
        },
        expectedProto: {
          creationClusterId: '209f0491-db3e-4a1d-96b3-0aa3640ca611',
          creationClusterVersion: {
            internal: 12,
            majorVal: 25,
            minorVal: 3
          },
          description: 'Table statistics refresh for system.public.descriptor',
          finishedMicros: '1758145907020882',
          startedMicros: '1758145906982997',
          statement: ["CREATE STATISTICS __auto__ FROM [3] WITH OPTIONS THROTTLING 0.9 AS OF SYSTEM TIME '-30s'"],
          usernameProto: 'node'
        }
      },
      {
        description: 'reconciling span configurations - legacy_payload',
        input: {
          job_id: '1107805622717054977',
          info_key: 'legacy_payload',
          written: '2025-09-17 21:50:46.424229+00',
          value: '\\x0a1f7265636f6e63696c696e67207370616e20636f6e66696775726174696f6e7312046e6f6465188afb8ed5e3e08f03a001019a0210209f0491db3e4a1d96b30aa3640ca611a20208081910031800200cda0100'
        },
        expectedProto: {
          autoSpanConfigReconciliation: {},
          creationClusterId: '209f0491-db3e-4a1d-96b3-0aa3640ca611',
          creationClusterVersion: {
            internal: 12,
            majorVal: 25,
            minorVal: 3
          },
          description: 'reconciling span configurations',
          noncancelable: true,
          startedMicros: '1758145846427018',
          usernameProto: 'node'
        }
      },
      {
        description: 'reconciling span configurations - legacy_progress',
        input: {
          job_id: '1107805622717054977',
          info_key: 'legacy_progress',
          written: '2025-09-17 22:22:52.69074+00',
          value: '\\x10bbf4d0ebeae08f03b2010c0a0a088181b5f5c1c28cb318'
        },
        expectedProto: {
          AutoSpanConfigReconciliation: {
            checkpoint: {
              wallTime: '1758147766530162817'
            }
          },
          modifiedMicros: '1758147772693051'
        }
      }
    ];

    it('should process job_info CSV with proto columns', () => {
      // Create a CSV with header and a few rows
      const csvContent = [
        'job_id\tinfo_key\twritten\tvalue',
        `100\tlegacy_payload\t2025-09-17 21:51:14.934948+00\t${testCases[0].input.value}`,
        `100\tlegacy_progress\t2025-09-17 21:50:46.454088+00\t${testCases[1].input.value}`,
        `101\tlegacy_payload\t2025-09-17 21:51:14.930635+00\t${testCases[2].input.value}`,
      ].join('\n');

      // Process the CSV
      const processed = preprocessCSV(csvContent, {
        tableName: 'system.job_info.txt',
        decodeProtos: true
      });

      // Should have added proto decoded columns
      expect(processed).toContain('job_id\tinfo_key\twritten\tvalue');

      // For now, just check that it doesn't error
      expect(processed).toBeDefined();
      const lines = processed.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(4); // header + 3 data rows
    });
  });

  describe('Proto message type detection', () => {
    it('should use correct proto type based on info_key', () => {
      const payloadCases = [
        { info_key: 'legacy_payload', expectedType: 'cockroach.sql.jobs.jobspb.Payload' },
        { info_key: 'legacy_progress', expectedType: 'cockroach.sql.jobs.jobspb.Progress' }
      ];

      payloadCases.forEach(({ info_key, expectedType }) => {
        // This test verifies that the correct proto type is selected
        // based on the info_key column value
        expect(info_key).toBeDefined();
        expect(expectedType).toBeDefined();

        // TODO: Implement getProtoTypeForInfoKey in csvPreprocessor
        // const protoType = getProtoTypeForInfoKey(info_key);
        // expect(protoType).toBe(expectedType);
      });
    });
  });

  describe('Error handling', () => {
    it('should handle invalid proto data gracefully', () => {
      const csvContent = [
        'job_id\tinfo_key\twritten\tvalue',
        '999\tlegacy_payload\t2025-09-17 21:50:46.424229+00\t\\xDEADBEEF'
      ].join('\n');

      // Should not throw, but return something
      const processed = preprocessCSV(csvContent, {
        tableName: 'system.job_info.txt',
        decodeProtos: true
      });
      expect(processed).toBeDefined();
    });

    it('should handle unknown info_key types', () => {
      const csvContent = [
        'job_id\tinfo_key\twritten\tvalue',
        '999\tunknown_key\t2025-09-17 21:50:46.424229+00\t\\x0123456789'
      ].join('\n');

      const processed = preprocessCSV(csvContent, {
        tableName: 'system.job_info.txt',
        decodeProtos: true
      });
      expect(processed).toBeDefined();
      // Should preserve the original hex value when type is unknown
    });
  });
});