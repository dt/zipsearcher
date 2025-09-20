import { describe, it, expect } from 'vitest';

describe('Log regex matching', () => {
  const logRegexWithCounter = /^([IWEF])([0-9: ]{15})(\.\d+)( \d+ )(\d+@)([^:]+)(:\d+)( ⋮ )(\[[^\]]*\]) (\d+) (.*)$/;
  const logRegexWithoutCounter = /^([IWEF])([0-9: ]{15})(\.\d+)( \d+ )([^@:]+)(:\d+)( ⋮ )(\[[^\]]*\]) (.*)$/;

  const testLines = [
    'I250917 21:50:59.410399 7012 4@util/log/event_log.go:90 ⋮ [T1,Vsystem,n1,client=127.0.0.1:39464,hostnossl,user=root] 1 {"Timestamp":1758145859410395744,"EventType":"client_authentication_ok","InstanceID":1,"Network":"tcp","RemoteAddress":"‹127.0.0.1:39464›","SessionID":"18663058157652af0000000000000001","Transport":"hostnossl","User":"‹root›","SystemIdentity":"‹root›","Method":"insecure"}',
    'I250917 21:50:59.410558 7012 util/log/file_sync_buffer.go:237 ⋮ [T1,config] file created at: 2025/09/17 21:50:59',
    'I250917 21:50:59.410573 7012 util/log/file_sync_buffer.go:237 ⋮ [T1,config] running on machine: ‹david-test-0001›',
    'I250917 21:50:59.410585 7012 util/log/file_sync_buffer.go:237 ⋮ [T1,config] binary: CockroachDB CCL v25.4.0-alpha.2-dev-5f5c6a65f739d6b247afec3411ed1284266bd1f7 (x86_64-pc-linux-gnu, built 2025/09/17 06:08:24, go1.23.12 X:nocoverageredesign)',
    'I250917 21:50:59.410592 7012 util/log/file_sync_buffer.go:237 ⋮ [T1,config] arguments: [‹./cockroach› ‹start› ‹--insecure› ‹--log› ‹file-defaults: {dir: \'logs\', exit-on-error: false}› ‹--listen-addr=:26257› ‹--http-addr=:26258› ‹--advertise-addr=10.142.0.19:26257› ‹--join=34.138.186.170:26257› ‹--store› ‹path=/mnt/data1/cockroach,attrs=store1:node1:node1store1› ‹--wal-failover=among-stores› ‹--cache=25%› ‹--locality=cloud=gce,region=us-east1,zone=us-east1-d› ‹--max-sql-memory=25%›]',
    'I250917 21:50:59.410641 7012 util/log/file_sync_buffer.go:237 ⋮ [T1,config] log format (utf8=✓): crdb-v2',
    'I250917 21:50:59.410647 7012 util/log/file_sync_buffer.go:237 ⋮ [T1,config] line format: [IWEF]yymmdd hh:mm:ss.uuuuuu goid [chan@]file:line redactionmark \\[tags\\] [counter] msg',
    'I250917 21:50:59.418273 7010 4@util/log/event_log.go:90 ⋮ [T1,Vsystem,n1,client=127.0.0.1:39464,hostnossl,user=root] 2 {"Timestamp":1758145859418270009,"EventType":"client_session_end","InstanceID":1,"Network":"tcp","RemoteAddress":"‹127.0.0.1:39464›","SessionID":"18663058157652af0000000000000001","Duration":8179834}',
    'I250917 22:22:59.440720 93611 4@util/log/event_log.go:90 ⋮ [T1,Vsystem,n1,client=10.142.0.19:54204,hostnossl,user=root] 3 {"Timestamp":1758147779440716999,"EventType":"client_authentication_ok","InstanceID":1,"Network":"tcp","RemoteAddress":"‹10.142.0.19:54204›","SessionID":"186632172031647e0000000000000001","Transport":"hostnossl","User":"‹root›","SystemIdentity":"‹root›","Method":"insecure"}',
    'I250917 22:23:06.174161 95149 4@util/log/event_log.go:90 ⋮ [T1,Vsystem,n1,client=10.142.0.19:40262,hostnossl,user=root] 4 {"Timestamp":1758147786174157557,"EventType":"client_authentication_ok","InstanceID":1,"Network":"tcp","RemoteAddress":"‹10.142.0.19:40262›","SessionID":"18663218b188875e0000000000000001","Transport":"hostnossl","User":"‹root›","SystemIdentity":"‹root›","Method":"insecure"}',
    'I250917 22:23:06.589921 95147 4@util/log/event_log.go:90 ⋮ [T1,Vsystem,n1,client=10.142.0.19:40262,hostnossl,user=root] 5 {"Timestamp":1758147786589915999,"EventType":"client_session_end","InstanceID":1,"Network":"tcp","RemoteAddress":"‹10.142.0.19:40262›","SessionID":"18663218b188875e0000000000000001","Duration":416038270}',
    'I250917 21:50:45.201984 67 util/log/file_sync_buffer.go:237 ⋮ [T1,config] file created at: 2025/09/17 21:50:45',
    'I250917 21:50:45.202035 67 util/log/file_sync_buffer.go:237 ⋮ [T1,config] running on machine: ‹david-test-0001›',
    'I250917 21:50:45.202044 67 util/log/file_sync_buffer.go:237 ⋮ [T1,config] binary: CockroachDB CCL v25.4.0-alpha.2-dev-5f5c6a65f739d6b247afec3411ed1284266bd1f7 (x86_64-pc-linux-gnu, built 2025/09/17 06:08:24, go1.23.12 X:nocoverageredesign)',
    'I250917 21:50:45.202049 67 util/log/file_sync_buffer.go:237 ⋮ [T1,config] arguments: [‹./cockroach› ‹start› ‹--insecure› ‹--log› ‹file-defaults: {dir: \'logs\', exit-on-error: false}› ‹--listen-addr=:26257› ‹--http-addr=:26258› ‹--advertise-addr=10.142.0.19:26257› ‹--join=34.138.186.170:26257› ‹--store› ‹path=/mnt/data1/cockroach,attrs=store1:node1:node1store1› ‹--wal-failover=among-stores› ‹--cache=25%› ‹--locality=cloud=gce,region=us-east1,zone=us-east1-d› ‹--max-sql-memory=25%›]',
    'I250917 21:50:45.202064 67 util/log/file_sync_buffer.go:237 ⋮ [T1,config] log format (utf8=✓): crdb-v2',
    'I250917 21:50:45.202067 67 util/log/file_sync_buffer.go:237 ⋮ [T1,config] line format: [IWEF]yymmdd hh:mm:ss.uuuuuu goid [chan@]file:line redactionmark \\[tags\\] [counter] msg',
    'I250917 21:50:59.410558 7012 util/log/file_sync_buffer.go:237 ⋮ [T1,config] file created at: 2025/09/17 21:50:59'
  ];

  testLines.forEach((line, index) => {
    it(`should match test line ${index + 1}`, () => {
      const matchWithCounter = line.match(logRegexWithCounter);
      const matchWithoutCounter = line.match(logRegexWithoutCounter);
      const match = matchWithCounter || matchWithoutCounter;

      expect(match).not.toBeNull();
      expect(match![0]).toBe(line); // Full match should be the entire line
    });
  });

  it('should extract correct parts from a sample line with counter', () => {
    const line = 'I250917 21:50:59.410399 7012 4@util/log/event_log.go:90 ⋮ [T1,Vsystem,n1] 1 {"test": "message"}';
    const match = line.match(logRegexWithCounter);

    expect(match).not.toBeNull();
    expect(match![1]).toBe('I'); // level
    expect(match![2]).toBe('250917 21:50:59'); // date time
    expect(match![3]).toBe('.410399'); // fractional
    expect(match![4]).toBe(' 7012 '); // pid
    expect(match![5]).toBe('4@'); // channel
    expect(match![6]).toBe('util/log/event_log.go'); // file
    expect(match![7]).toBe(':90'); // line
    expect(match![8]).toBe(' ⋮ '); // separator
    expect(match![9]).toBe('[T1,Vsystem,n1]'); // tags
    expect(match![10]).toBe('1'); // counter
    expect(match![11]).toBe('{"test": "message"}'); // message
  });
});