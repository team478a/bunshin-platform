import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AI_TRAINING_V1_MODULE_KEY } from '@bunshin/capability-training';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { buildAiTrainingAdminDashboard } from '../../../../../src/services/ai-training-admin-dashboard';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const dateTimeLabel = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tokyo',
      }).format(value)
    : 'まだ実施していません';

const engagementLabel = {
  NOT_STARTED: '初期設定待ち',
  ACTIVE: '継続中',
  NEEDS_SUPPORT: '復習を支援',
  INACTIVE: '再開を支援',
  COMPLETED: '修了',
} as const;

export default async function AiTrainingAdminPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/training`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const programs = await db.prisma.serviceProgram.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      status: { in: ['ACTIVE', 'SUSPENDED'] },
      settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
    },
    select: { id: true, displayName: true },
    orderBy: { createdAt: 'desc' },
  });
  const programIds = programs.map(({ id }) => id);
  const enrollments =
    programIds.length === 0
      ? []
      : await db.prisma.programEnrollment.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: { in: programIds },
            status: { in: ['INVITED', 'ACTIVE', 'COMPLETED', 'EXPIRED'] },
          },
          select: {
            id: true,
            serviceProgramId: true,
            groupMembershipId: true,
            status: true,
          },
          orderBy: { updatedAt: 'desc' },
        });
  const enrollmentIds = enrollments.map(({ id }) => id);
  const membershipIds = enrollments.map(({ groupMembershipId }) => groupMembershipId);
  const [memberships, profiles, snapshots, assignments, answers] =
    enrollmentIds.length === 0
      ? [[], [], [], [], []]
      : await Promise.all([
          db.prisma.groupMembership.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              id: { in: membershipIds },
              serviceRole: 'PARTICIPANT',
              status: { in: ['ACTIVE', 'SUSPENDED'] },
            },
            select: {
              id: true,
              user: { select: { displayName: true, email: true } },
            },
          }),
          db.prisma.trainingParticipantProfile.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
            },
            select: {
              programEnrollmentId: true,
              role: true,
              aiLevel: true,
              currentTopic: true,
              needsReview: true,
              recentFailures: true,
              updatedAt: true,
            },
          }),
          db.prisma.programProgressSnapshot.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
            },
            select: {
              programEnrollmentId: true,
              phaseKey: true,
              stateKey: true,
              bottleneckKey: true,
              completedMissionCount: true,
              lastActionAt: true,
            },
          }),
          db.prisma.programMissionAssignment.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
            },
            select: {
              programEnrollmentId: true,
              missionDefinitionKey: true,
              displaySnapshot: true,
            },
            orderBy: [{ programEnrollmentId: 'asc' }, { sequence: 'desc' }],
          }),
          db.prisma.trainingMissionAnswer.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
              evaluationStatus: 'READY',
            },
            select: { programEnrollmentId: true, evaluation: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
          }),
        ]);
  const programById = new Map(programs.map((item) => [item.id, item]));
  const membershipById = new Map(memberships.map((item) => [item.id, item]));
  const profileByEnrollment = new Map(profiles.map((item) => [item.programEnrollmentId, item]));
  const snapshotByEnrollment = new Map(snapshots.map((item) => [item.programEnrollmentId, item]));
  const assignmentByEnrollment = new Map<string, (typeof assignments)[number]>();
  for (const assignment of assignments) {
    if (!assignmentByEnrollment.has(assignment.programEnrollmentId))
      assignmentByEnrollment.set(assignment.programEnrollmentId, assignment);
  }
  const answerByEnrollment = new Map<string, (typeof answers)[number]>();
  for (const answer of answers) {
    if (!answerByEnrollment.has(answer.programEnrollmentId))
      answerByEnrollment.set(answer.programEnrollmentId, answer);
  }
  const dashboard = buildAiTrainingAdminDashboard(
    enrollments.flatMap((enrollment) => {
      const member = membershipById.get(enrollment.groupMembershipId);
      const program = programById.get(enrollment.serviceProgramId);
      if (!member || !program) return [];
      const profile = profileByEnrollment.get(enrollment.id) ?? null;
      const answer = answerByEnrollment.get(enrollment.id) ?? null;
      return [
        {
          enrollmentId: enrollment.id,
          enrollmentStatus: enrollment.status,
          programName: program.displayName,
          participantName: member.user.displayName || member.user.email || '参加者',
          participantEmail: member.user.email,
          profile,
          progress: snapshotByEnrollment.get(enrollment.id) ?? null,
          assignment: assignmentByEnrollment.get(enrollment.id) ?? null,
          latestEvaluation: answer?.evaluation ?? null,
          evaluationUpdatedAt: answer?.updatedAt ?? null,
          profileUpdatedAt: profile?.updatedAt ?? null,
        },
      ];
    }),
    new Date(),
  );

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page training-admin">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>AI研修の進み具合</h1>
          <p>受講者が今どこまで進み、誰に声かけが必要かを確認できます。</p>
          <Link href={`/s/${serviceSlug}/manage` as Route}>← 管理メニューへ戻る</Link>
        </header>

        {programs.length === 0 ? (
          <section className="settings-card">
            <h2>AI研修はまだ設定されていません</h2>
            <p>先に「実践プログラム」でAI研修をこのサービスへ追加してください。</p>
            <Link className="button" href={`/s/${serviceSlug}/manage/programs` as Route}>
              実践プログラムを開く
            </Link>
          </section>
        ) : (
          <>
            <section className="settings-card training-admin__summary">
              <h2>全体の状況</h2>
              <div className="weekly-report__metrics">
                <article>
                  <strong>{dashboard.totals.active}</strong>
                  <span>受講中</span>
                </article>
                <article>
                  <strong>{dashboard.totals.continuationPercent}%</strong>
                  <span>7日以内の継続率</span>
                </article>
                <article>
                  <strong>{dashboard.totals.completedMissions}</strong>
                  <span>完了した課題</span>
                </article>
                <article>
                  <strong>{dashboard.totals.needsSupport}</strong>
                  <span>声かけが必要</span>
                </article>
              </div>
              <p>
                登録者 {dashboard.totals.participants}人のうち、受講中は
                {dashboard.totals.active}
                人です。継続率は、受講中で直近7日以内に研修を進めた人の割合です。
              </p>
            </section>

            <section className="settings-card">
              <h2>受講者ごとの状況</h2>
              <p>回答本文は表示せず、進捗とAI評価で見つかった苦手だけを表示しています。</p>
              {dashboard.participants.length === 0 ? (
                <p>AI研修へ登録された受講者はまだいません。</p>
              ) : (
                <div className="training-admin__participants">
                  {dashboard.participants.map((participant) => (
                    <article className="training-admin__participant" key={participant.enrollmentId}>
                      <div className="training-admin__participant-heading">
                        <div>
                          <h3>{participant.participantName}</h3>
                          <p>{participant.programName}</p>
                        </div>
                        <strong data-engagement={participant.engagement}>
                          {engagementLabel[participant.engagement]}
                        </strong>
                      </div>
                      <dl>
                        <div>
                          <dt>受講者の設定</dt>
                          <dd>
                            {participant.roleLabel}・{participant.aiLevelLabel}
                          </dd>
                        </div>
                        <div>
                          <dt>進捗</dt>
                          <dd>{participant.completedMissionCount}課題を完了</dd>
                        </div>
                        <div>
                          <dt>現在のテーマ</dt>
                          <dd>{participant.currentTopic}</dd>
                        </div>
                        <div>
                          <dt>直近の課題</dt>
                          <dd>{participant.currentMission}</dd>
                        </div>
                        <div>
                          <dt>苦手・確認点</dt>
                          <dd>{participant.weakArea}</dd>
                        </div>
                        <div>
                          <dt>最終実施</dt>
                          <dd>{dateTimeLabel(participant.lastActivityAt)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </PublicShell>
  );
}
