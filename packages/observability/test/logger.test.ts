import { describe, expect, it } from 'vitest';
import { createLogger, type LogEntry } from '../src';

describe('structured logger', () => {
  it('includes request context and redacts secrets', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ sink: (entry) => entries.push(entry), now: () => new Date(0) });
    logger.info('request complete', {
      requestId: 'req_12345678',
      databaseUrl: 'postgresql://user:pass@host/db',
      token: 'abc',
    });
    expect(entries[0]).toMatchObject({
      requestId: 'req_12345678',
      databaseUrl: '[REDACTED]',
      token: '[REDACTED]',
    });
    expect(JSON.stringify(entries[0])).not.toContain('pass');
  });
});
