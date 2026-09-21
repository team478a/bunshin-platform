import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  AI_TRAINING_HELP_RESOLVED_EVENT,
  AI_TRAINING_V1_MODULE_KEY,
  parseAiTrainingOperationsSettings,
} from '@bunshin/capability-training';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { buildAiTrainingAdminDashboard } from '../../../../../src/services/ai-training-admin-dashboard';
import { buildAiTrainingPilotAnalytics } from '../../../../../src/services/ai-training-pilot-analytics';
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

const formText = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

async function updateTrainingOperations(formData: FormData) {
  'use server';
  const serviceSlug = formText(formData, 'serviceSlug');
  const programId = formText(formData, 'programId');
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor || !serviceSlug || !programId) return;
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) return;
  const db = await import('@bunshin/database');
  const program = await db.prisma.serviceProgram.findFirst({
    where: {
      id: programId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
    },
    select: { id: true, settings: true },
  });
  if (!program || typeof program.settings !== 'object' || program.settings === null) return;
  const hour = Number(formText(formData, 'notificationHour'));
  const reminderHours = Number(formText(formData, 'postponedReminderHours'));
  await db.prisma.serviceProgram.update({
    where: { id: program.id },
    data: {
      settings: {
        ...(program.settings as Record<string, unknown>),
        trainingOperations: {
          notificationsEnabled: formData.get('notificationsEnabled') === 'on',
          notificationHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9,
          postponedReminderEnabled: formData.get('postponedReminderEnabled') === 'on',
          postponedReminderHours:
            Number.isInteger(reminderHours) && reminderHours >= 1 && reminderHours <= 168
              ? reminderHours
              : 24,
          helpQueueEnabled: formData.get('helpQueueEnabled') === 'on',
        },
      },
    },
  });
  revalidatePath(`/s/${serviceSlug}/manage/training`);
}

async function resolveTrainingHelp(formData: FormData) {
  'use server';
  const serviceSlug = formText(formData, 'serviceSlug');
  const helpEventId = formText(formData, 'helpEventId');
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor || !serviceSlug || !helpEventId) return;
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) return;
  const db = await import('@bunshin/database');
  const help = await db.prisma.programActionEvent.findFirst({
    where: {
      id: helpEventId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      eventType: 'HELP_REQUESTED',
    },
  });
  if (!help) return;
  await db.prisma.programActionEvent.upsert({
    where: {
      workspaceId_groupId_idempotencyKey: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        idempotencyKey: `training-help-resolved:${help.id}`,
      },
    },
    update: {},
    create: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      programEnrollmentId: help.programEnrollmentId,
      missionAssignmentId: help.missionAssignmentId,
      eventType: AI_TRAINING_HELP_RESOLVED_EVENT,
      sourceResourceType: 'PROGRAM_ACTION_EVENT',
      sourceResourceId: help.id,
      idempotencyKey: `training-help-resolved:${help.id}`,
      schemaVersion: 1,
      metadata: { helpRequestEventId: help.id },
      actorUserId: actor.userId,
      occurredAt: new Date(),
    },
  });
  revalidatePath(`/s/${serviceSlug}/manage/training`);
}

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
    select: { id: true, displayName: true, settings: true },
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
  const [memberships, profiles, snapshots, assignments, answers, toolkitItems] =
    enrollmentIds.length === 0
      ? [[], [], [], [], [], []]
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
              learningGoalKey: true,
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
            select: {
              programEnrollmentId: true,
              evaluation: true,
              evaluatedAt: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
          }),
          db.prisma.trainingToolkitItem.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
            },
            select: { programEnrollmentId: true },
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
  const analytics = buildAiTrainingPilotAnalytics({
    enrollmentIds,
    assessedEnrollmentIds: profiles.map(({ programEnrollmentId }) => programEnrollmentId),
    goalEnrollmentIds: profiles.flatMap(({ programEnrollmentId, learningGoalKey }) =>
      learningGoalKey ? [programEnrollmentId] : [],
    ),
    presentedEnrollmentIds: assignments.map(({ programEnrollmentId }) => programEnrollmentId),
    answers: answers.map(({ programEnrollmentId, evaluation, evaluatedAt }) => ({
      programEnrollmentId,
      evaluation,
      evaluatedAt,
    })),
    toolkitEnrollmentIds: toolkitItems.map(({ programEnrollmentId }) => programEnrollmentId),
  });
  const helpEvents =
    enrollmentIds.length === 0
      ? []
      : await db.prisma.programActionEvent.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            programEnrollmentId: { in: enrollmentIds },
            eventType: { in: ['HELP_REQUESTED', AI_TRAINING_HELP_RESOLVED_EVENT] },
          },
          orderBy: { occurredAt: 'desc' },
        });
  const resolvedHelpIds = new Set(
    helpEvents.flatMap((event) =>
      event.eventType === AI_TRAINING_HELP_RESOLVED_EVENT &&
      typeof event.metadata === 'object' &&
      event.metadata !== null &&
      !Array.isArray(event.metadata) &&
      typeof (event.metadata as Record<string, unknown>)['helpRequestEventId'] === 'string'
        ? [(event.metadata as Record<string, unknown>)['helpRequestEventId'] as string]
        : [],
    ),
  );
  const enrollmentById = new Map(enrollments.map((item) => [item.id, item]));
  const unresolvedHelp = helpEvents.filter(
    (event) => event.eventType === 'HELP_REQUESTED' && !resolvedHelpIds.has(event.id),
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
              <h2>配信と受講支援の設定</h2>
              <p>時刻は日本時間です。「後でやる」の再通知は、受講者が押した時点から数えます。</p>
              {programs.map((program) => {
                const settings = parseAiTrainingOperationsSettings(program.settings);
                return (
                  <form
                    action={updateTrainingOperations}
                    key={program.id}
                    className="settings-form"
                  >
                    <input type="hidden" name="serviceSlug" value={serviceSlug} />
                    <input type="hidden" name="programId" value={program.id} />
                    <h3>{program.displayName}</h3>
                    <label>
                      <input
                        type="checkbox"
                        name="notificationsEnabled"
                        defaultChecked={settings.notificationsEnabled}
                      />{' '}
                      毎日のLINE通知を送る
                    </label>
                    <label>
                      通知時刻
                      <select
                        name="notificationHour"
                        defaultValue={String(settings.notificationHour)}
                      >
                        {Array.from({ length: 24 }, (_, hour) => (
                          <option value={hour} key={hour}>
                            {hour}:00
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name="postponedReminderEnabled"
                        defaultChecked={settings.postponedReminderEnabled}
                      />{' '}
                      「後でやる」の人へ再通知する
                    </label>
                    <label>
                      再通知までの時間
                      <input
                        type="number"
                        name="postponedReminderHours"
                        min="1"
                        max="168"
                        defaultValue={settings.postponedReminderHours}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name="helpQueueEnabled"
                        defaultChecked={settings.helpQueueEnabled}
                      />{' '}
                      「困った」を支援一覧へ表示する
                    </label>
                    <button className="button" type="submit">
                      設定を保存
                    </button>
                  </form>
                );
              })}
            </section>

            <section className="settings-card">
              <h2>対応が必要な「困った」</h2>
              <p>受講者が支援を求めた課題だけを表示します。対応後に完了へ変更してください。</p>
              {unresolvedHelp.length === 0 ? (
                <p>未対応の依頼はありません。</p>
              ) : (
                <div className="training-admin__participants">
                  {unresolvedHelp.map((event) => {
                    const enrollment = enrollmentById.get(event.programEnrollmentId);
                    const membership = enrollment
                      ? membershipById.get(enrollment.groupMembershipId)
                      : null;
                    return (
                      <article className="training-admin__participant" key={event.id}>
                        <h3>
                          {membership?.user.displayName || membership?.user.email || '参加者'}
                        </h3>
                        <p>{dateTimeLabel(event.occurredAt)} に支援を依頼しました。</p>
                        <form action={resolveTrainingHelp}>
                          <input type="hidden" name="serviceSlug" value={serviceSlug} />
                          <input type="hidden" name="helpEventId" value={event.id} />
                          <button className="button button--secondary" type="submit">
                            対応済みにする
                          </button>
                        </form>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="settings-card training-admin__analytics">
              <h2>Pilotの利用状況</h2>
              <p>登録から実務成果物の保存まで、どこで止まっているかを確認できます。</p>
              <div className="training-analytics-grid">
                <article>
                  <strong>{analytics.assessmentCompletionPercent}%</strong>
                  <span>初期診断完了</span>
                  <small>
                    {analytics.assessmentCompleted} / {analytics.participants}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.goalSelectionPercent}%</strong>
                  <span>Goal選択</span>
                  <small>
                    {analytics.goalSelected} / {analytics.assessmentCompleted}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.missionStartPercent}%</strong>
                  <span>課題開始</span>
                  <small>
                    {analytics.missionStarted} / {analytics.assessmentCompleted}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.answerPercent}%</strong>
                  <span>回答</span>
                  <small>
                    {analytics.answered} / {analytics.missionStarted}人
                  </small>
                </article>
              </div>
            </section>

            <section className="settings-card training-admin__analytics">
              <h2>学習品質と実務定着</h2>
              <p>評価後に復習できたか、Skillが改善したか、成果物を残せたかを確認します。</p>
              <div className="training-analytics-grid">
                <article>
                  <strong>{analytics.passPercent}%</strong>
                  <span>PASS率</span>
                  <small>
                    PASS {analytics.passedEvaluations}件 / REVIEW {analytics.reviewEvaluations}件
                  </small>
                </article>
                <article>
                  <strong>{analytics.retryPercent}%</strong>
                  <span>再回答率</span>
                  <small>
                    {analytics.retriedParticipants} / {analytics.reviewParticipants}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.skillImprovementPercent}%</strong>
                  <span>Skill改善</span>
                  <small>
                    {analytics.skillImprovedParticipants} / {analytics.skillMeasuredParticipants}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.toolkitSavePercent}%</strong>
                  <span>Toolkit保存</span>
                  <small>{analytics.toolkitSavedParticipants}人が保存</small>
                </article>
              </div>
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
