import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const databaseSource = (file: string) =>
  readFileSync(new URL(`../../../packages/database/src/${file}`, import.meta.url), 'utf8');

describe('external tracking repository module boundary', () => {
  it('delegates every audited administrator command', () => {
    const repository = databaseSource('external-tracking.ts');
    const commands = databaseSource('external-tracking-admin.ts');
    for (const operation of [
      'createSystem',
      'addAllowedDomain',
      'upsertMemberIdentity',
      'createLink',
      'activateLink',
      'suspendLink',
      'updateLink',
    ]) {
      expect(repository).toContain(`this.adminCommands.${operation}(input)`);
    }
    expect(
      commands.match(/await this\.manage\(input\.workspaceId, input\.actorUserId\)/g),
    ).toHaveLength(7);
    expect(commands.match(/externalTrackingAuditLog\.create/g)).toHaveLength(7);
  });

  it('delegates participant settings without changing the public repository', () => {
    const repository = databaseSource('external-tracking.ts');
    expect(repository).toContain('export class PrismaExternalTrackingLinkRepository');
    expect(repository).toContain('listExternalTrackingMemberSettings(');
    expect(repository).toContain('saveExternalTrackingMemberDraft(');
    expect(repository).not.toContain("const name = '本人登録の専用URL'");
  });

  it('keeps participant reads and writes scoped to the current user and service', () => {
    const member = databaseSource('external-tracking-member.ts');
    expect(member).toContain('context.serviceMatches(input.groupId)');
    expect(member.match(/userId: input\.actorUserId/g)).toHaveLength(2);
    expect(member.match(/consentedAt: \{ not: null \}/g)).toHaveLength(2);
    expect(member).toContain('workspaceId: input.workspaceId');
    expect(member).toContain('groupId: input.groupId');
  });

  it('keeps generated-link resolution scoped to the Bunshin, member, and product', () => {
    const resolution = databaseSource('external-tracking-resolution.ts');
    expect(resolution).toContain('ownerUserId: input.actorUserId');
    expect(resolution).toContain('workspaceId: input.workspaceId');
    expect(resolution).toContain('consentedAt: { not: null }');
    expect(resolution).toContain('productPackAssignment.findFirst');
    expect(resolution).toContain('productPack: { groupId: input.groupId }');
  });
});
