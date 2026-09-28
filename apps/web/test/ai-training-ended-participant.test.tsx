import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const fake = vi.hoisted(() => ({
  member: vi.fn(),
  enrollment: vi.fn(),
  program: vi.fn(),
  retention: vi.fn(),
  current: vi.fn(),
  context: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('../src/services/member-service-page', () => ({
  resolveAuthenticatedMemberServicePage: fake.context,
}));
vi.mock('../app/ui/public-shell', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-card', () => ({
  AiTrainingCard: () => <div>ACTIVE_TRAINING</div>,
}));
vi.mock(
  '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-data-export-card',
  () => ({ AiTrainingDataExportCard: () => <div>PERSONAL_EXPORT</div> }),
);
vi.mock('@bunshin/capability-training', async () => {
  const original = await vi.importActual<typeof import('@bunshin/capability-training')>(
    '@bunshin/capability-training',
  );
  return {
    ...original,
    AiTrainingParticipantService: class {
      current = fake.current;
    },
  };
});
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupMembership: { findFirst: fake.member },
    programEnrollment: { findFirst: fake.enrollment },
    serviceProgram: { findFirst: fake.program },
    trainingDataRetentionState: { findFirst: fake.retention },
  },
  PrismaAiTrainingRuntimeRepository: class {},
}));
import Page from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/page';
import { AiTrainingEndedCard } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-ended-card';
const renderPage = () =>
  Page({ params: Promise.resolve({ serviceSlug: 'training', programEnrollmentId: 'enrollment' }) });
describe('ended training participant view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.context.mockResolvedValue({
      actor: { userId: 'owner' },
      service: {
        workspaceId: 'workspace',
        serviceId: 'group',
        configuration: {
          brand: { primaryColor: '#111', secondaryColor: '#222', fontFamily: 'sans-serif' },
        },
      },
    });
    fake.member.mockResolvedValue({ id: 'membership' });
    fake.enrollment.mockResolvedValue({
      serviceProgramId: 'program',
      status: 'COMPLETED',
      endsAt: new Date('2020-01-01'),
    });
    fake.program.mockResolvedValue({
      settings: { moduleKey: 'AI_TRAINING_V1' },
      displayName: 'My training',
    });
    fake.retention.mockResolvedValue(null);
    fake.current.mockResolvedValue({
      enrollmentId: 'enrollment',
      programName: 'Training',
      enrollmentStatus: 'ACTIVE',
      startsAt: new Date(),
      endsAt: null,
      profile: null,
      goal: null,
      action: null,
    });
  });
  it.each(['COMPLETED', 'CANCELLED', 'EXPIRED'])(
    'renders %s without invoking runtime or jobs',
    async (status) => {
      fake.enrollment.mockResolvedValue({ serviceProgramId: 'program', status, endsAt: null });
      const html = renderToStaticMarkup(await renderPage());
      expect(html).toContain('AI研修の受講状況');
      expect(html).toContain('サービス運営');
      expect(html).toContain('新しい課題や回答提出、AI評価は利用できません');
      expect(fake.current).not.toHaveBeenCalled();
      expect(html).not.toContain('ACTIVE_TRAINING');
      if (status === 'CANCELLED') {
        expect(html).not.toContain('PERSONAL_EXPORT');
        expect(html).not.toContain('/toolkit');
      } else {
        expect(html).toContain('PERSONAL_EXPORT');
        expect(html).toContain('/toolkit');
      }
    },
  );
  it('preserves active training path and reads no retention state there', async () => {
    fake.enrollment.mockResolvedValue({
      serviceProgramId: 'program',
      status: 'ACTIVE',
      endsAt: null,
    });
    expect(renderToStaticMarkup(await renderPage())).toContain('ACTIVE_TRAINING');
    expect(fake.current).toHaveBeenCalledOnce();
    expect(fake.retention).not.toHaveBeenCalled();
  });
  it('requires scoped active participant ownership before loading end information', async () => {
    await renderPage();
    expect(fake.member).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        groupId: 'group',
        userId: 'owner',
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(fake.enrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'enrollment',
          workspaceId: 'workspace',
          groupId: 'group',
          groupMembershipId: 'membership',
        }),
      }),
    );
    expect(fake.retention).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace', groupId: 'group', programEnrollmentId: 'enrollment' },
      select: { endedAt: true },
    });
    expect(fake.program).toHaveBeenCalledWith(
      expect.objectContaining({ select: { settings: true, displayName: true } }),
    );
  });
  it.each(['membership', 'enrollment', 'program'])(
    'keeps missing/foreign/revoked %s inaccessible',
    async (target) => {
      ({ membership: fake.member, enrollment: fake.enrollment, program: fake.program })[
        target as 'membership' | 'enrollment' | 'program'
      ].mockResolvedValue(null);
      await expect(renderPage()).rejects.toThrow('NOT_FOUND');
      expect(fake.retention).not.toHaveBeenCalled();
      expect(fake.current).not.toHaveBeenCalled();
    },
  );
  it('keeps invited enrollment and cancelled non-training program inaccessible', async () => {
    fake.enrollment.mockResolvedValue({ status: 'INVITED' });
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
    fake.enrollment.mockResolvedValue({ serviceProgramId: 'program', status: 'CANCELLED' });
    fake.program.mockResolvedValue({ settings: { moduleKey: 'AI_RESALE_V1' } });
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
    expect(fake.retention).not.toHaveBeenCalled();
  });
  it('does not guess historical completion date from planned endsAt', async () => {
    expect(renderToStaticMarkup(await renderPage())).toContain('記録されていません');
    fake.retention.mockResolvedValue({ endedAt: new Date('2026-09-29T00:00:00Z') });
    expect(renderToStaticMarkup(await renderPage())).toContain('2026/09/29');
  });
  it('uses only past expiry date as fallback', async () => {
    fake.enrollment.mockResolvedValue({
      serviceProgramId: 'program',
      status: 'EXPIRED',
      endsAt: new Date('2020-01-01'),
    });
    expect(renderToStaticMarkup(await renderPage())).toContain('2020/01/01');
    fake.enrollment.mockResolvedValue({
      serviceProgramId: 'program',
      status: 'EXPIRED',
      endsAt: new Date('2999-01-01'),
    });
    expect(renderToStaticMarkup(await renderPage())).toContain('記録されていません');
  });
  it('renders a read-only cancellation card without submission or restart controls', () => {
    const html = renderToStaticMarkup(
      <AiTrainingEndedCard
        serviceSlug="training"
        programEnrollmentId="enrollment"
        programName="Training"
        status="CANCELLED"
        endedAt={null}
      />,
    );
    expect(html).not.toMatch(/<form|<textarea|<button/);
    expect(html).toContain('プログラム一覧へ戻る');
    expect(html).toContain('取り消されています');
  });
});
