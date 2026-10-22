import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readReleasePrismaDiagnostic,
  runReleasePrismaCommand,
} from '../scripts/release-prisma-command.mjs';

describe('safe Prisma subprocess wrapper', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([
    ['P1011 TLS self signed certificate in certificate chain', 'database-tls-failure'],
    ['P1000 authentication failed', 'database-authentication-failed'],
    ['P1001 cannot reach database server', 'database-unreachable'],
    ['too many connections', 'database-connection-capacity'],
    ['unknown synthetic error', 'unclassified-preflight-error'],
  ])('classifies %s without logging raw output', async (raw, expected) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn()
      .mockResolvedValue({
        reason: 'EXITED',
        status: 1,
        capturedOutput: `${raw} postgresql://owner:synthetic-secret@host/db private-sql`,
      });
    expect(await runReleasePrismaCommand(['probe', 'node', 'cli', 'schema'], {}, execute)).toBe(1);
    const output = vi.mocked(console.error).mock.calls.flat().join('\n');
    expect(output).toBe(`RELEASE_PRISMA_PROBE_FAILED:${expected}`);
    expect(output).not.toContain('synthetic-secret');
    expect(output).not.toContain('private-sql');
    expect(readReleasePrismaDiagnostic(output)).toEqual({ phase: 'probe', diagnostic: expected });
  });
  it('only runs read-only SQL in probe and disables duplicate lock only for resolve', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ reason: 'EXITED', status: 0, capturedOutput: 'discard me' });
    expect(
      await runReleasePrismaCommand(
        ['probe', 'node', 'cli', 'schema'],
        { PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1' },
        execute,
      ),
    ).toBe(0);
    expect(execute.mock.calls[0]![2].env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK).toBeUndefined();
    expect(execute.mock.calls[0]![2].input).toBe('BEGIN READ ONLY; SELECT 1; COMMIT;');
    expect(
      await runReleasePrismaCommand(
        ['resolve', 'node', 'cli', 'schema', '20261020120000_example'],
        {},
        execute,
      ),
    ).toBe(0);
    expect(execute.mock.calls[1]![2].env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK).toBe('1');
    expect(execute.mock.calls[1]![2].input).toBeUndefined();
  });
  it('rejects invalid operations before launching a child and ignores forged labels', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn();
    expect(await runReleasePrismaCommand(['deploy', 'node', 'cli', 'schema'], {}, execute)).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(
      readReleasePrismaDiagnostic('RELEASE_PRISMA_PROBE_FAILED:private-secret'),
    ).toBeUndefined();
  });
});
