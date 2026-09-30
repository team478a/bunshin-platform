import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { latestServiceLegalDocuments } from '../src/service-legal-latest';
import { PrismaServiceParticipationRegistrationRepository } from '../src/service-participation-registration-repository';
import { PrismaServiceParticipationMembershipRepository } from '../src/service-participation-membership-repository';
import { PrismaServiceNotificationPreferenceRepository } from '../src/service-notification-preference';

const at = new Date('2026-09-30T00:00:00Z');
const documents = [
  { id: 'terms-v3', type: 'TERMS', version: 3, title: '新版規約', content: '新版' },
  { id: 'terms-v1', type: 'TERMS', version: 1, title: '旧版規約', content: '旧版' },
  { id: 'privacy-v2', type: 'PRIVACY', version: 2, title: '新版Privacy', content: '新版' },
  { id: 'privacy-v1', type: 'PRIVACY', version: 1, title: '旧版Privacy', content: '旧版' },
];
const config = {
  id: 'config-a',
  workspaceId: 'workspace-a',
  groupId: 'service-a',
  registration: { mode: 'PUBLIC', referralEnabled: false },
};
const membership = {
  id: 'membership-a',
  workspaceId: 'workspace-a',
  groupId: 'service-a',
  userId: 'user-a',
  status: 'ACTIVE',
  role: 'PARTICIPANT',
  consentedAt: at,
  lastUsedAt: null,
};
const m = {
  config: vi.fn(),
  documents: vi.fn(),
  memberUnique: vi.fn(),
  memberFirst: vi.fn(),
  workspace: vi.fn(),
  consentCount: vi.fn(),
  consentRows: vi.fn(),
  consentCreate: vi.fn(),
  memberUpdate: vi.fn(),
  event: vi.fn(),
  preference: vi.fn(),
};
const client = {
  serviceConfiguration: { findFirst: m.config },
  serviceLegalDocument: { findMany: m.documents },
  groupMembership: { findUnique: m.memberUnique, findFirst: m.memberFirst, update: m.memberUpdate },
  workspaceMembership: { findUnique: m.workspace },
  serviceLegalConsent: {
    count: m.consentCount,
    findMany: m.consentRows,
    createMany: m.consentCreate,
  },
  serviceMembershipEvent: { createMany: m.event },
  serviceNotificationPreference: { findUnique: m.preference },
  $transaction: (callback: (tx: typeof client) => unknown) => callback(client),
} as unknown as PrismaClient;

beforeEach(() => {
  vi.resetAllMocks();
  m.config.mockResolvedValue(config);
  m.documents.mockResolvedValue(documents);
  m.memberUnique.mockResolvedValue(null);
  m.memberFirst.mockResolvedValue(membership);
  m.workspace.mockResolvedValue({ status: 'ACTIVE' });
  m.memberUpdate.mockResolvedValue(membership);
  m.preference.mockResolvedValue(null);
  m.consentRows.mockResolvedValue([]);
  m.consentCreate.mockResolvedValue({ count: 2 });
});

describe('latest effective service legal document', () => {
  it('selects highest version per type regardless of input order', () => {
    expect(latestServiceLegalDocuments([...documents].reverse()).map(({ id }) => id)).toEqual([
      'privacy-v2',
      'terms-v3',
    ]);
    expect(latestServiceLegalDocuments(documents).map(({ id }) => id)).toEqual([
      'terms-v3',
      'privacy-v2',
    ]);
    expect(latestServiceLegalDocuments([])).toEqual([]);
  });

  it('shows only latest effective versions on the public participation view', async () => {
    const repository = new PrismaServiceParticipationRegistrationRepository(client);
    const view = await repository.findView({ slug: 'public-a', actorUserId: null, now: at });
    expect(view?.legalDocuments.map(({ id }) => id)).toEqual(['terms-v3', 'privacy-v2']);
    expect(m.documents).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          status: 'PUBLISHED',
          effectiveAt: { lte: at },
        },
      }),
    );
    expect(m.memberUnique).not.toHaveBeenCalled();
  });

  it('rejects stale consent IDs before membership changes and accepts only current IDs for validation', async () => {
    const repository = new PrismaServiceParticipationRegistrationRepository(client);
    const scope = {
      slug: 'public-a',
      actorUserId: 'user-a',
      referralCode: null,
      referralClickId: null,
      now: at,
    };
    expect(
      await repository.request({ ...scope, legalDocumentIds: ['terms-v1', 'privacy-v1'] }),
    ).toBeNull();
    expect(m.workspace).not.toHaveBeenCalled();
    // Continue past the consent gate, then stop at the existing non-participant guard.
    m.memberUnique.mockResolvedValue({ role: 'MANAGER' });
    expect(
      await repository.request({ ...scope, legalDocumentIds: ['terms-v3', 'privacy-v2'] }),
    ).toBeNull();
    expect(m.workspace).toHaveBeenCalled();
    expect(m.documents).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          status: 'PUBLISHED',
          effectiveAt: { lte: at },
        }),
      }),
    );
  });

  it('requires consent to latest versions before recording service use', async () => {
    const repository = new PrismaServiceParticipationMembershipRepository(client);
    m.consentCount.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const input = { slug: 'public-a', actorUserId: 'user-a', now: at };
    expect(await repository.recordUse(input)).toBeNull();
    expect(m.memberUpdate).not.toHaveBeenCalled();
    expect(await repository.recordUse(input)).toMatchObject({ id: 'membership-a' });
    expect(m.consentCount).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        groupMembershipId: 'membership-a',
        userId: 'user-a',
        legalDocumentId: { in: ['terms-v3', 'privacy-v2'] },
      },
    });
    expect(m.documents).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, type: true, version: true } }),
    );
  });

  it('requires consent to latest versions before reading notification preferences', async () => {
    const repository = new PrismaServiceNotificationPreferenceRepository(client);
    m.consentCount.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const input = {
      slug: 'public-a',
      actorUserId: 'user-a',
      now: at,
      topic: 'DAILY_MISSION',
      channel: 'LINE' as const,
    };
    await expect(repository.get(input)).resolves.toEqual({ accessible: false, preference: null });
    expect(m.preference).not.toHaveBeenCalled();
    await expect(repository.get(input)).resolves.toEqual({ accessible: true, preference: null });
    expect(m.consentCount).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        groupMembershipId: 'membership-a',
        userId: 'user-a',
        legalDocumentId: { in: ['terms-v3', 'privacy-v2'] },
      },
    });
    expect(m.documents).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, type: true, version: true } }),
    );
  });

  it('preserves no-documents behavior without requiring a consent count', async () => {
    m.documents.mockResolvedValue([]);
    const repository = new PrismaServiceParticipationMembershipRepository(client);
    await expect(
      repository.recordUse({ slug: 'public-a', actorUserId: 'user-a', now: at }),
    ).resolves.toMatchObject({ id: 'membership-a' });
    expect(m.consentCount).not.toHaveBeenCalled();
  });

  it('shows only this active member current legal documents and consent state', async () => {
    m.consentRows.mockResolvedValue([{ legalDocumentId: 'privacy-v2' }]);
    const repository = new PrismaServiceParticipationMembershipRepository(client);
    const input = { slug: 'public-a', actorUserId: 'user-a', now: at };
    await expect(repository.findLegalConsentView(input)).resolves.toMatchObject({
      acceptedDocumentIds: ['privacy-v2'],
      legalDocuments: [
        expect.objectContaining({ id: 'terms-v3' }),
        expect.objectContaining({ id: 'privacy-v2' }),
      ],
    });
    expect(m.consentRows).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        groupMembershipId: 'membership-a',
        userId: 'user-a',
        legalDocumentId: { in: ['terms-v3', 'privacy-v2'] },
      }),
      select: { legalDocumentId: true },
    });
    m.memberFirst.mockResolvedValue(null);
    await expect(repository.findLegalConsentView(input)).resolves.toBeNull();
    expect(m.consentRows).toHaveBeenCalledTimes(1);
  });

  it('adds only current-version consent for the active member without changing membership', async () => {
    const repository = new PrismaServiceParticipationMembershipRepository(client);
    const input = { slug: 'public-a', actorUserId: 'user-a', now: at };
    await expect(
      repository.acceptLegalDocuments({ ...input, legalDocumentIds: ['terms-v1', 'privacy-v2'] }),
    ).resolves.toBe(false);
    expect(m.consentCreate).not.toHaveBeenCalled();
    await expect(
      repository.acceptLegalDocuments({ ...input, legalDocumentIds: ['terms-v3', 'privacy-v2'] }),
    ).resolves.toBe(true);
    expect(m.consentCreate).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ legalDocumentId: 'terms-v3', groupMembershipId: 'membership-a' }),
        expect.objectContaining({
          legalDocumentId: 'privacy-v2',
          groupMembershipId: 'membership-a',
        }),
      ]),
      skipDuplicates: true,
    });
    expect(m.memberUpdate).not.toHaveBeenCalled();
    m.memberFirst.mockResolvedValue(null);
    await expect(
      repository.acceptLegalDocuments({ ...input, legalDocumentIds: ['terms-v3', 'privacy-v2'] }),
    ).resolves.toBe(false);
    expect(m.consentCreate).toHaveBeenCalledTimes(1);
  });
});
