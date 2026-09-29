import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  visible: vi.fn(),
  legal: vi.fn(),
  participation: vi.fn(),
  fortune: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('ROUTE_NOT_FOUND');
  },
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveVisitorServiceContext: m.visible }));
vi.mock('@bunshin/application', () => ({
  ServiceParticipationService: class {
    findView = m.participation;
  },
}));
vi.mock('@bunshin/database', () => ({
  PrismaServiceParticipationRepository: class {},
  prisma: {
    serviceLegalDocument: { findFirst: m.legal },
    fortuneServiceSetting: { findFirst: m.fortune },
    groupMembership: { findFirst: () => Promise.resolve(null) },
  },
}));

import { ServiceLegalPage } from '../app/s/[serviceSlug]/service-legal-page';
import ServiceManualPage, {
  generateMetadata as manualMetadata,
} from '../app/s/[serviceSlug]/manual/page';
import ServiceHelpPage, {
  generateMetadata as helpMetadata,
} from '../app/s/[serviceSlug]/help/page';

const slug = 'sennokuni-media';
const params = Promise.resolve({ serviceSlug: slug });
const privateService = {
  workspaceId: 'workspace-a',
  serviceId: 'service-a',
  configuration: {
    slug,
    visibility: 'PRIVATE',
    displayName: '千ノ国メディア',
    contactEmail: null,
    brand: { primaryColor: '#123', secondaryColor: '#456', fontFamily: 'system-ui' },
    registration: { onboardingConfig: {}, surveyConfig: {} },
  },
};
const publicService = {
  ...privateService,
  configuration: { ...privateService.configuration, visibility: 'PUBLIC' },
};
const document = { title: '利用規約', version: 3, content: '公開済み本文' };

beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'user-a' });
  m.visible.mockResolvedValue(privateService);
  m.legal.mockResolvedValue(document);
  m.participation.mockResolvedValue({ legalDocuments: [{ ...document, type: 'TERMS' }] });
  m.fortune.mockResolvedValue(null);
});

describe('private service legal document', () => {
  it.each(['TERMS', 'PRIVACY', 'COMMERCE_DISCLOSURE'] as const)(
    'limits %s to the resolved service and effective published version',
    async (type) => {
      const result = await ServiceLegalPage({ serviceSlug: slug, type });
      expect(result).toBeTruthy();
      expect(m.visible).toHaveBeenCalledWith(slug, 'user-a');
      expect(m.legal).toHaveBeenCalledWith({
        where: {
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          type,
          status: 'PUBLISHED',
          effectiveAt: { lte: expect.any(Date) },
        },
        orderBy: { version: 'desc' },
        select: { title: true, version: true, content: true },
      });
      expect(m.participation).not.toHaveBeenCalled();
    },
  );
  it('uses a different user and service boundary instead of a cached legal document', async () => {
    m.actor.mockResolvedValue({ userId: 'user-b' });
    m.visible.mockResolvedValue({
      ...privateService,
      workspaceId: 'workspace-b',
      serviceId: 'service-b',
    });
    await ServiceLegalPage({ serviceSlug: 'other-private', type: 'TERMS' });
    expect(m.visible).toHaveBeenCalledWith('other-private', 'user-b');
    expect(m.legal).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'workspace-b', groupId: 'service-b' }),
      }),
    );
  });
  it('does not fetch any document after a private visitor is denied', async () => {
    m.visible.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not visible'));
    await expect(ServiceLegalPage({ serviceSlug: slug, type: 'TERMS' })).rejects.toThrow(
      'ROUTE_NOT_FOUND',
    );
    expect(m.legal).not.toHaveBeenCalled();
    expect(m.participation).not.toHaveBeenCalled();
  });
  it('does not disguise an unexpected resolver failure as a missing page', async () => {
    m.visible.mockRejectedValue(new Error('db unavailable'));
    await expect(ServiceLegalPage({ serviceSlug: slug, type: 'TERMS' })).rejects.toThrow(
      'db unavailable',
    );
    expect(m.legal).not.toHaveBeenCalled();
  });
  it('keeps the anonymous public participation view and legal documents', async () => {
    m.actor.mockResolvedValue(null);
    m.visible.mockResolvedValue(publicService);
    await ServiceLegalPage({ serviceSlug: slug, type: 'TERMS' });
    expect(m.visible).toHaveBeenCalledWith(slug, null);
    expect(m.participation).toHaveBeenCalledWith({ slug, actorUserId: null });
    expect(m.legal).not.toHaveBeenCalled();
  });
});

describe('visitor manual and help', () => {
  it('lets an existing private member open the manual and use a private service title', async () => {
    expect(await ServiceManualPage({ params })).toBeTruthy();
    expect((await manualMetadata({ params })).title).toBe('千ノ国メディア｜かんたんマニュアル');
    expect(m.visible).toHaveBeenCalledWith(slug, 'user-a');
  });
  it('does not reuse the private member manual for anonymous or another user', async () => {
    m.visible.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not visible'));
    m.actor.mockResolvedValue(null);
    await expect(ServiceManualPage({ params })).rejects.toThrow('ROUTE_NOT_FOUND');
    m.actor.mockResolvedValue({ userId: 'user-b' });
    await expect(ServiceManualPage({ params })).rejects.toThrow('ROUTE_NOT_FOUND');
    expect(m.visible).toHaveBeenNthCalledWith(1, slug, null);
    expect(m.visible).toHaveBeenNthCalledWith(2, slug, 'user-b');
  });
  it('keeps public manuals available to anonymous visitors', async () => {
    m.actor.mockResolvedValue(null);
    m.visible.mockResolvedValue(publicService);
    expect(await ServiceManualPage({ params })).toBeTruthy();
    expect(m.visible).toHaveBeenCalledWith(slug, null);
  });
  it('does not turn manual DB errors into missing pages', async () => {
    m.visible.mockRejectedValue(new Error('db unavailable'));
    await expect(ServiceManualPage({ params })).rejects.toThrow('db unavailable');
  });
  it('uses visitor access for the help body and metadata', async () => {
    await ServiceHelpPage({ params });
    expect((await helpMetadata({ params })).title).toBe('千ノ国メディア｜ヘルプ');
    expect(m.visible).toHaveBeenCalledWith(slug, 'user-a');
  });
});
