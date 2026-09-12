import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repository = readFileSync('src/index.ts', 'utf8');

describe('point activity service scope', () => {
  it('counts weekly posts only in the service that received the activity', () => {
    expect(repository).toContain('input.workspaceId,\n                      groupId,');
    expect(repository).toContain('...(groupId ? { bunshin: { groupId } } : {})');
  });

  it('keeps daily and weekly idempotency separate for each service', () => {
    expect(repository).toContain("const servicePeriod = groupId ? `:group:${groupId}` : '';");
    expect(repository).toContain('period: `day:${dayKey}${servicePeriod}`');
    expect(repository).toContain('period: `week:${weekKey}${servicePeriod}`');
    expect(repository).toContain('legacyIdempotencyKey');
    expect(repository).toContain('{ idempotencyKey: legacyIdempotencyKey, groupId }');
  });
});
