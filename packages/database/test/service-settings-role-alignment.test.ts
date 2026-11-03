import type { ServiceFoundationRepository } from '@bunshin/application';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { saveServiceFoundation } from '../src/service-foundation-save';
import { findServiceFoundationByGroup } from '../src/service-foundation-read';

const scope = { workspaceId: 'workspace-a', groupId: 'service-a', actorUserId: 'operator' };
type Save = Parameters<ServiceFoundationRepository['save']>[0];
const configuration: Save['configuration'] = {
  slug: 'service-a',
  displayName: 'Updated',
  description: 'Description',
  operatorName: 'Operator',
  contactEmail: null,
  visibility: 'PRIVATE',
  poweredByEnabled: true,
  startsAt: null,
  endsAt: null,
  termsUrl: null,
  privacyUrl: null,
  brand: {
    logoUrl: null,
    iconUrl: null,
    faviconUrl: null,
    primaryColor: '#111111',
    secondaryColor: '#222222',
    fontFamily: 'system-ui',
  },
  registration: {
    mode: 'PUBLIC',
    emailEnabled: true,
    lineEnabled: false,
    inviteCodeEnabled: false,
    referralEnabled: false,
    onboardingConfig: {},
    surveyConfig: {},
  },
};
const existing = { ...scope, ...configuration, id: 'config', displayName: 'Previous' };

function fixture(role: string, status = 'ACTIVE', groupId = scope.groupId) {
  const member = ({
    workspaceId,
    groupId: group,
    userId,
    status: required,
    serviceRole,
  }: {
    workspaceId?: string;
    groupId?: string;
    userId: string;
    status: string;
    serviceRole?: { in: string[] };
  }) =>
    userId === scope.actorUserId &&
    required === status &&
    group === groupId &&
    workspaceId === scope.workspaceId &&
    serviceRole?.in.includes(role);
  const tx = {
    platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'legacy-admin' }) },
    group: { findFirst: vi.fn().mockResolvedValue({ id: scope.groupId }) },
    groupMembership: {
      findFirst: vi.fn((query: { where: Parameters<typeof member>[0] }) =>
        Promise.resolve(member(query.where) ? { id: 'membership' } : null),
      ),
    },
    serviceConfiguration: {
      findUnique: vi.fn().mockResolvedValue(existing),
      findFirst: vi.fn(
        ({
          where,
        }: {
          where: {
            workspaceId: string;
            groupId: string;
            group: { memberships: { some: Parameters<typeof member>[0] } };
          };
        }) =>
          Promise.resolve(
            member({
              ...where.group.memberships.some,
              groupId: where.groupId,
              workspaceId: where.workspaceId,
            })
              ? existing
              : null,
          ),
      ),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...existing, ...configuration }),
      upsert: vi.fn().mockResolvedValue(existing),
    },
    organizationEntitlement: { findUnique: vi.fn().mockResolvedValue(null) },
    serviceBrand: { upsert: vi.fn().mockResolvedValue({}) },
    serviceRegistrationPolicy: { upsert: vi.fn().mockResolvedValue({}) },
    serviceConfigurationAudit: { create: vi.fn().mockResolvedValue({}) },
  };
  const client = {
    ...tx,
    $transaction: (run: (db: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaClient;
  return { tx, client };
}

const command = {
  ...scope,
  serviceAccess: 'ADMINISTRATION',
  reason: 'Update settings',
  configuration,
} satisfies Save;

describe('service settings role alignment', () => {
  it.each(['SERVICE_OWNER', 'SERVICE_ADMIN'])(
    'lets %s read and save settings without a legacy role',
    async (role) => {
      const { client, tx } = fixture(role);
      await expect(findServiceFoundationByGroup(client, command)).resolves.toMatchObject({
        displayName: 'Previous',
      });
      await expect(saveServiceFoundation(client, command)).resolves.toMatchObject({
        displayName: 'Updated',
      });
      expect(tx.platformAdmin.findFirst).not.toHaveBeenCalled();
      expect(tx.serviceConfigurationAudit.create).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['CONTENT_EDITOR', 'ACTIVE', scope.groupId],
    ['PARTICIPANT', 'ACTIVE', scope.groupId],
    ['SERVICE_ADMIN', 'REVOKED', scope.groupId],
    ['SERVICE_ADMIN', 'ACTIVE', 'different-service'],
  ])('rejects settings access for %s / %s / %s', async (role, status, groupId) => {
    const { client, tx } = fixture(role, status, groupId);
    await expect(findServiceFoundationByGroup(client, command)).resolves.toBeNull();
    await expect(saveServiceFoundation(client, command)).resolves.toBeNull();
    expect(tx.serviceConfiguration.upsert).not.toHaveBeenCalled();
    expect(tx.serviceConfigurationAudit.create).not.toHaveBeenCalled();
  });

  it('permits content reads but keeps platform settings and suspended entitlements protected', async () => {
    const editor = fixture('CONTENT_EDITOR');
    await expect(
      findServiceFoundationByGroup(editor.client, { ...scope, serviceAccess: 'CONTENT' }),
    ).resolves.not.toBeNull();
    const { client, tx } = fixture('SERVICE_OWNER');
    await expect(
      saveServiceFoundation(client, {
        ...command,
        configuration: { ...configuration, visibility: 'PUBLIC' },
      }),
    ).resolves.toBeNull();
    tx.organizationEntitlement.findUnique.mockResolvedValue({ suspended: true });
    await expect(saveServiceFoundation(client, command)).resolves.toBeNull();
    expect(tx.serviceConfiguration.upsert).not.toHaveBeenCalled();
  });
});
