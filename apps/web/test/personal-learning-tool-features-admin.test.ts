import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const f = vi.hoisted(() => ({
  user: vi.fn(),
  role: vi.fn(),
  origin: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  current: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.user }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('@bunshin/database', () => ({
  PrismaPlatformAdminRepository: class {
    findActivePlatformAdminByUserId() {
      return Promise.resolve(f.role());
    }
  },
  prisma: {
    personalLearningToolFeatureUpdate: {
      findMany: f.list,
    },
    $transaction: (work: (tx: unknown) => Promise<unknown>) =>
      work({
        personalLearningToolFeatureUpdate: {
          create: f.create,
          findUnique: f.current,
          updateMany: f.updateMany,
        },
        personalLearningToolFeatureAudit: { create: f.audit },
      }),
  },
}));

import {
  listPersonalLearningToolFeaturesResponse as list,
  savePersonalLearningToolFeatureResponse as save,
} from '../src/http/personal-learning-tool-features-admin';

const userId = '33333333-3333-4333-8333-333333333333';
const featureId = '44444444-4444-4444-8444-444444444444';
const request = (payload: unknown) =>
  new Request('https://example.test/api/admin/personal-learning-tool-features', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.resetAllMocks();
  f.user.mockResolvedValue({ userId });
  f.role.mockResolvedValue({ role: 'SUPER_ADMIN' });
  f.origin.mockReturnValue(undefined);
  f.list.mockResolvedValue([]);
  f.create.mockResolvedValue({ id: featureId });
  f.audit.mockResolvedValue({ id: 'audit-id' });
  f.current.mockResolvedValue({ id: featureId, status: 'PENDING' });
  f.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.clearAllMocks());

describe('Manaberu official AI-tool update review', () => {
  it('registers only official HTTPS source links as pending and records creation', async () => {
    const result = await save(
      request({
        action: 'CREATE',
        toolKey: 'CHATGPT',
        title: '新しい機能',
        summary: '公式発表に記載された機能の概要を確認します。',
        sourceUrl: 'https://help.openai.com/en/articles/123',
        sourceTitle: '公式アップデート',
        publishedAt: null,
      }),
    );
    expect(result.status).toBe(201);
    expect(f.create).toHaveBeenCalledOnce();
    const createArgs = f.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArgs.data).toMatchObject({
      toolKey: 'CHATGPT',
      sourceUrl: 'https://help.openai.com/en/articles/123',
      createdByUserId: userId,
    });
    expect(createArgs.data).not.toHaveProperty('status');
    expect(f.audit).toHaveBeenCalledWith({
      data: { featureId, actorUserId: userId, action: 'CREATED' },
    });
  });

  it.each([
    ['non-HTTPS', 'http://openai.com/updates'],
    ['non-official host', 'https://openai.example.test/updates'],
    ['credentials', 'https://user:pass@openai.com/updates'],
    ['fragment', 'https://openai.com/updates#latest'],
    ['non-standard port', 'https://openai.com:8443/updates'],
  ])('rejects %s source links without saving', async (_label, sourceUrl) => {
    const result = await save(
      request({
        action: 'CREATE',
        toolKey: 'CHATGPT',
        title: '新しい機能',
        summary: '公式発表に記載された機能の概要を確認します。',
        sourceUrl,
        sourceTitle: '公式アップデート',
        publishedAt: null,
      }),
    );
    expect(result.status).toBe(400);
    expect(f.create).not.toHaveBeenCalled();
  });

  it('requires Super Admin review and records approved state plus reason atomically', async () => {
    f.role.mockResolvedValue({ role: 'OPERATOR' });
    const denied = await save(
      request({ action: 'APPROVE', featureId, reason: '公式内容を確認しました。' }),
    );
    expect(denied.status).toBe(403);
    expect(f.current).not.toHaveBeenCalled();

    f.role.mockResolvedValue({ role: 'SUPER_ADMIN' });
    const approved = await save(
      request({ action: 'APPROVE', featureId, reason: '公式内容を確認しました。' }),
    );
    expect(approved.status).toBe(200);
    expect(f.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: featureId, status: 'PENDING' },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedByUserId: userId,
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          featureId,
          actorUserId: userId,
          action: 'APPROVED',
          reason: '公式内容を確認しました。',
        }),
      }),
    );
  });

  it('rejects stale review transitions and does not append an audit', async () => {
    f.current.mockResolvedValue({ id: featureId, status: 'APPROVED' });
    const result = await save(
      request({ action: 'REJECT', featureId, reason: '情報が古いため却下します。' }),
    );
    expect(result.status).toBe(409);
    expect(f.updateMany).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });

  it('requires a signed-in admin and same-origin mutation', async () => {
    f.user.mockResolvedValue(null);
    expect(
      (await save(request({ action: 'APPROVE', featureId, reason: '確認済みです。' }))).status,
    ).toBe(401);

    f.user.mockResolvedValue({ userId });
    f.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin rejected');
    });
    expect(
      (await save(request({ action: 'APPROVE', featureId, reason: '確認済みです。' }))).status,
    ).toBe(403);
    expect(f.current).not.toHaveBeenCalled();
  });

  it('lists a bounded set of admin-visible metadata without learner content', async () => {
    const response = await list();
    expect(response.status).toBe(200);
    expect(f.list).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        include: expect.objectContaining({
          creator: expect.any(Object),
          reviewer: expect.any(Object),
          audits: expect.objectContaining({ take: 10 }),
        }),
      }),
    );
  });
});
