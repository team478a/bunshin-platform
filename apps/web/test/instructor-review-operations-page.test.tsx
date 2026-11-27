import { ApplicationError } from '@bunshin/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  operations: vi.fn(),
  assigned: vi.fn(),
  configure: vi.fn(),
  assign: vi.fn(),
  refund: vi.fn(),
  answer: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/services/instructor-review-runtime', () => ({
  getInstructorReviewOperations: fake.operations,
  getAssignedInstructorReviews: fake.assigned,
  configureInstructorReview: fake.configure,
  assignInstructorReview: fake.assign,
  refundInstructorReview: fake.refund,
  answerInstructorReview: fake.answer,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import InstructorPage from '../app/s/[serviceSlug]/instructor-reviews/page';
import ManagerPage from '../app/s/[serviceSlug]/manage/training/instructor-reviews/page';

const serviceSlug = 'manaberu-style';
const renderProps = (slug = serviceSlug) => ({
  params: Promise.resolve({ serviceSlug: slug }),
  searchParams: Promise.resolve({}),
});

describe('instructor review operations pages', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fake.actor.mockResolvedValue({ userId: 'signed-in-user' });
  });

  it.each([
    [ManagerPage, '/s/manaberu-style/manage/training/instructor-reviews'],
    [InstructorPage, '/s/manaberu-style/instructor-reviews'],
  ])('retains the service page through sign-in before reading any reviews', async (page, path) => {
    fake.actor.mockResolvedValue(null);
    await expect(page(renderProps())).rejects.toThrow(
      `REDIRECT:/s/manaberu-style/login?returnTo=${encodeURIComponent(path)}`,
    );
    expect(fake.operations).not.toHaveBeenCalled();
    expect(fake.assigned).not.toHaveBeenCalled();
  });

  it.each([ManagerPage, InstructorPage])(
    'denies a different service before looking up the actor',
    async (page) => {
      await expect(page(renderProps('different-service'))).rejects.toThrow('NOT_FOUND');
      expect(fake.actor).not.toHaveBeenCalled();
      expect(fake.operations).not.toHaveBeenCalled();
      expect(fake.assigned).not.toHaveBeenCalled();
    },
  );

  it('renders only operational details in the management queue and gives a link to the lecturer page', async () => {
    fake.operations.mockResolvedValue({
      product: {
        enabled: true,
        programIds: ['training-plan'],
        priceYen: 2500,
        description: '文章レビュー',
        responseHours: 24,
        cancellationTerms: '回答前まで',
        instructorUserIds: ['assigned-instructor'],
        capacity: 5,
      },
      programs: [{ id: 'training-plan', label: '研修プラン' }],
      instructors: [{ id: 'assigned-instructor', label: '担当の講師' }],
      rows: [
        {
          id: 'review',
          title: '公開できる課題名',
          instructorUserId: 'assigned-instructor',
          status: 'IN_PROGRESS',
          dueAt: new Date('2026-11-28T02:00:00.000Z'),
          excerpt: '依頼された講師だけに開く文章',
        },
      ],
    });
    const html = renderToStaticMarkup(await ManagerPage(renderProps()));
    expect(fake.operations).toHaveBeenCalledWith(serviceSlug, 'signed-in-user');
    expect(fake.assigned).not.toHaveBeenCalled();
    expect(html).toContain('公開できる課題名');
    expect(html).toContain('対応中');
    expect(html).toContain('担当の講師');
    expect(html).toContain('全額返金を依頼する');
    expect(html).toContain('/s/manaberu-style/instructor-reviews');
    expect(html).not.toContain('依頼された講師だけに開く文章');
  });

  it('lets an operator retry a pending refund while keeping instructor reassignment closed', async () => {
    fake.operations.mockResolvedValue({
      product: null,
      programs: [],
      instructors: [],
      rows: [
        {
          id: 'review',
          title: '返金予定の課題',
          instructorUserId: 'old-assignment',
          status: 'REFUND_PENDING',
          dueAt: null,
        },
      ],
    });
    const html = renderToStaticMarkup(await ManagerPage(renderProps()));
    expect(html).toContain('返金処理中');
    expect(html).toContain('返金処理を再試行する');
    expect(html).toContain('登録解除済みの講師');
    expect(html).not.toContain('担当を保存');
  });

  it('uses the signed-in lecturer as the scope and renders the shared revision from its own queue', async () => {
    fake.assigned.mockResolvedValue([
      {
        id: 'review',
        title: '担当する課題',
        focus: '確認してほしい一点',
        excerpt: '共有用の抜粋',
        planRevision: 8,
        answer: null,
      },
    ]);
    const html = renderToStaticMarkup(await InstructorPage(renderProps()));
    expect(fake.assigned).toHaveBeenCalledWith(serviceSlug, 'signed-in-user');
    expect(fake.operations).not.toHaveBeenCalled();
    expect(html).toContain('担当する課題');
    expect(html).toContain('依頼時の課題版 8');
    expect(html).toContain('共有用の抜粋');
    expect(html).toContain('回答を送る');
  });

  it('treats backend authorization failures as unavailable pages', async () => {
    fake.operations.mockRejectedValue(new ApplicationError('FORBIDDEN', 'denied'));
    fake.assigned.mockRejectedValue(new ApplicationError('NOT_FOUND', 'denied'));
    await expect(ManagerPage(renderProps())).rejects.toThrow('NOT_FOUND');
    await expect(InstructorPage(renderProps())).rejects.toThrow('NOT_FOUND');
  });
});
