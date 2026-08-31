import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { PublicShell } from '../../../ui/public-shell';
import { MemberProgramsEditor } from './member-programs-editor';

export const dynamic = 'force-dynamic';
export default async function MemberProgramsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/programs`)}`);
  const service = await resolvePublicServiceContext(serviceSlug).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!membership) notFound();
  const enrollments = await db.prisma.programEnrollment.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      groupMembershipId: membership.id,
      status: 'ACTIVE',
    },
  });
  const programIds = enrollments.map((item) => item.serviceProgramId);
  const [programs, policies, definitions, preferences, goals] = await Promise.all([
    db.prisma.serviceProgram.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        id: { in: programIds },
      },
    }),
    db.prisma.serviceProgramSupportPolicy.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        serviceProgramId: { in: programIds },
        status: 'ACTIVE',
      },
    }),
    db.prisma.programGoalDefinition.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        serviceProgramId: { in: programIds },
        status: 'ACTIVE',
      },
      orderBy: { sortOrder: 'asc' },
    }),
    db.prisma.programMemberPreference.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        groupMembershipId: membership.id,
      },
    }),
    db.prisma.programMemberGoal.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        groupMembershipId: membership.id,
        status: 'ACTIVE',
      },
    }),
  ]);
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">あなたの活動</p>
          <h1>参加中のプログラム</h1>
          <p>欲しいサポートと、今の目標を自分で選べます。</p>
          <a href={`/s/${serviceSlug}/home`}>← ホームへ戻る</a>
        </header>
        <MemberProgramsEditor
          serviceSlug={serviceSlug}
          items={enrollments.map((enrollment) => {
            const program = programs.find((item) => item.id === enrollment.serviceProgramId)!;
            const policy = policies.find(
              (item) => item.serviceProgramId === enrollment.serviceProgramId,
            );
            const preference = preferences.find(
              (item) => item.programEnrollmentId === enrollment.id,
            );
            const goal = goals.find((item) => item.programEnrollmentId === enrollment.id);
            return {
              enrollmentId: enrollment.id,
              name: program?.displayName ?? '実践プログラム',
              guidance: policy?.guidance ?? '',
              modes: (policy?.allowedSupportModes as string[] | undefined) ?? [
                enrollment.supportMode,
              ],
              memberMayChoose: policy?.memberMayChoose ?? false,
              preferredMode: preference?.preferredSupportMode ?? enrollment.supportMode,
              notes: preference?.notes ?? '',
              currentGoal: goal
                ? `${goal.title}：${goal.targetValue.toString()} ${goal.unit}`
                : null,
              definitions: definitions
                .filter((item) => item.serviceProgramId === enrollment.serviceProgramId)
                .map((item) => ({
                  id: item.id,
                  name: item.name,
                  metricType: item.metricType,
                  unit: item.unit,
                  target: item.suggestedTarget?.toString() ?? '',
                })),
            };
          })}
        />
      </main>
    </PublicShell>
  );
}
