import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('service Bunshin owner boundary', () => {
  it('limits normal service lists to the actor-owned Bunshins', () => {
    const start = source.indexOf('async listForService');
    const end = source.indexOf('async find(', start);
    const method = source.slice(start, end);
    expect(method).toContain('groupId: input.groupId');
    expect(method).toContain('ownerUserId: input.actorUserId');
  });

  it('limits a service-scoped detail lookup to its owner', () => {
    const start = source.indexOf('async find(input: ScopedBunshinReference)');
    const end = source.indexOf('async update(', start);
    const method = source.slice(start, end);
    expect(method).toContain('groupId: input.groupId ?? null');
    expect(method).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });
});
