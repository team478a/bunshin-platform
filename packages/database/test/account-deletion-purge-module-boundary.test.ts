import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const accountModule = readFileSync(new URL('../src/account-deletion.ts', import.meta.url), 'utf8');
const purgeModule = readFileSync(
  new URL('../src/account-deletion-purge.ts', import.meta.url),
  'utf8',
);
const publicModule = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('account deletion purge module boundary', () => {
  it('keeps destructive personal-data cleanup separate from request orchestration', () => {
    expect(purgeModule).toContain('export class PrismaAccountDeletionPurgeRepository');
    expect(accountModule).not.toContain('class PrismaAccountDeletionPurgeRepository');
  });

  it('preserves the legacy export while exposing the direct public module', () => {
    expect(accountModule).toContain(
      "export { PrismaAccountDeletionPurgeRepository } from './account-deletion-purge';",
    );
    expect(publicModule).toContain(
      "export { PrismaAccountDeletionPurgeRepository } from './account-deletion-purge';",
    );
  });

  it('retains owner, workspace and organization safety checks in the purge boundary', () => {
    expect(purgeModule).toContain("workspace: { type: 'ORGANIZATION' }");
    expect(purgeModule).toContain('ownerUserId: input.userId');
    expect(purgeModule).toContain("workspace: { type: 'PERSONAL' }");
    expect(purgeModule).toContain("blockedReason: 'MANUAL_REVIEW_REQUIRED'");
  });
});
