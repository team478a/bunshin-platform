import { describe, expect, it, vi } from 'vitest';
import {
  CreateLegalDocumentDraft,
  PublishLegalDocument,
  AcceptRequiredLegalConsents,
  type LegalConsentRepository,
  RequestAccountDeletion,
  CancelAccountDeletion,
  type AccountDeletionRequestRepository,
  type LegalDocumentRepository,
} from '../src';

const document = {
  id: 'doc-1',
  type: 'TERMS' as const,
  version: 1,
  title: '利用規約',
  content: '本文',
  status: 'DRAFT' as const,
  effectiveAt: null,
  publishedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const repository = (overrides: Partial<LegalDocumentRepository> = {}): LegalDocumentRepository => ({
  listForAdmin: () => Promise.resolve([]),
  createDraft: () => Promise.resolve(document),
  publish: () => Promise.resolve(document),
  findPublished: () => Promise.resolve(null),
  ...overrides,
});

const consentRepository = (
  overrides: Partial<LegalConsentRepository> = {},
): LegalConsentRepository => ({
  findRequiredForUser: () => Promise.resolve([]),
  acceptRequired: () => Promise.resolve(true),
  listConsentCountsForAdmin: () => Promise.resolve([]),
  ...overrides,
});

describe('legal document use cases', () => {
  it('normalizes and creates a versioned draft', async () => {
    const createDraft = vi.fn().mockResolvedValue(document);
    await new CreateLegalDocumentDraft(repository({ createDraft })).execute({
      actorUserId: 'admin-1',
      type: 'TERMS',
      title: ' 利用規約 ',
      content: ' 本文 ',
    });
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ title: '利用規約', content: '本文' }),
    );
  });
  it('rejects empty content', async () => {
    await expect(
      new CreateLegalDocumentDraft(repository()).execute({
        actorUserId: 'admin-1',
        type: 'PRIVACY',
        title: 'Privacy',
        content: ' ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('hides unauthorized publish targets', async () => {
    await expect(
      new PublishLegalDocument(repository({ publish: () => Promise.resolve(null) })).execute({
        actorUserId: 'member-1',
        documentId: 'doc-1',
        effectiveAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('legal consent use cases', () => {
  it('records the exact current document set', async () => {
    const acceptRequired = vi.fn().mockResolvedValue(true);
    await new AcceptRequiredLegalConsents(consentRepository({ acceptRequired })).execute({
      userId: 'user-a',
      documentIds: ['terms-v1', 'privacy-v1'],
    });
    expect(acceptRequired).toHaveBeenCalledWith({
      userId: 'user-a',
      documentIds: ['terms-v1', 'privacy-v1'],
    });
  });
  it('rejects duplicate documents and a changed current set', async () => {
    await expect(
      new AcceptRequiredLegalConsents(consentRepository()).execute({
        userId: 'user-a',
        documentIds: ['same', 'same'],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      new AcceptRequiredLegalConsents(
        consentRepository({ acceptRequired: () => Promise.resolve(false) }),
      ).execute({
        userId: 'user-a',
        documentIds: ['terms-v1'],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('account deletion request use cases', () => {
  const value = {
    id: 'request-1',
    userId: 'user-a',
    status: 'REQUESTED' as const,
    requestedAt: new Date(0),
    scheduledFor: new Date(0),
    cancelledAt: null,
    completedAt: null,
    attemptCount: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    processingStartedAt: null,
    blockedReason: null,
    lastErrorCategory: null,
    executionVersion: 1,
    summary: null,
  };
  const repository = (
    overrides: Partial<AccountDeletionRequestRepository> = {},
  ): AccountDeletionRequestRepository => ({
    findCurrent: () => Promise.resolve(null),
    request: () => Promise.resolve(value),
    cancel: () => Promise.resolve({ ...value, status: 'CANCELLED', cancelledAt: new Date() }),
    listForAdmin: () => Promise.resolve([]),
    ...overrides,
  });
  it('schedules deletion after a 14 day grace period', async () => {
    const request = vi.fn().mockResolvedValue(value);
    const now = new Date('2026-08-22T00:00:00Z');
    await new RequestAccountDeletion(repository({ request }), () => now).execute('user-a');
    expect(request).toHaveBeenCalledWith('user-a', new Date('2026-09-05T00:00:00Z'));
  });
  it('does not let a user cancel a missing request', async () => {
    await expect(
      new CancelAccountDeletion(repository({ cancel: () => Promise.resolve(null) })).execute(
        'user-b',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
