import {
  AiResaleOfferService,
  AiResaleParticipantService,
  AiResaleV1Policy,
  ResalePersistenceError,
} from '@bunshin/capability-resale';
import {
  AI_TRAINING_V1_MODULE_KEY,
  AiTrainingParticipantService,
  AiTrainingV1Policy,
  TrainingRuntimeError,
} from '@bunshin/capability-training';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { resolveAuthenticatedMemberServicePage } from '../../../../../src/services/member-service-page';
import { PublicShell } from '../../../../ui/public-shell';
import { AiResaleActionCard } from './ai-resale-action-card';
import { AiTrainingCard } from './ai-training-card';

export const dynamic = 'force-dynamic';

export default async function ProgramParticipantPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
}) {
  const { serviceSlug, programEnrollmentId } = await params;
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/programs/${programEnrollmentId}`,
  );
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      serviceRole: 'PARTICIPANT',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!membership) notFound();
  const enrollment = await db.prisma.programEnrollment.findFirst({
    where: {
      id: programEnrollmentId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      groupMembershipId: membership.id,
      status: { in: ['ACTIVE', 'COMPLETED', 'EXPIRED'] },
    },
    select: { serviceProgramId: true },
  });
  if (!enrollment) notFound();
  const program = await db.prisma.serviceProgram.findFirst({
    where: {
      id: enrollment.serviceProgramId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
    },
    select: { settings: true },
  });
  if (!program) notFound();
  const moduleKey =
    typeof program.settings === 'object' &&
    program.settings !== null &&
    !Array.isArray(program.settings)
      ? program.settings['moduleKey']
      : null;
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  if (moduleKey === AI_TRAINING_V1_MODULE_KEY) {
    let trainingState;
    try {
      trainingState = await new AiTrainingParticipantService(
        new db.PrismaAiTrainingRuntimeRepository(db.prisma),
        new AiTrainingV1Policy(),
      ).current({
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        actorUserId: actor.userId,
        programEnrollmentId,
        now: new Date(),
      });
    } catch (error) {
      if (error instanceof TrainingRuntimeError && error.code === 'NOT_FOUND') notFound();
      throw error;
    }
    return (
      <PublicShell showPlatformBrand={false}>
        <main className="service-entry resale-action-page training-page" style={style}>
          <header className="service-entry__header">
            <p className="eyebrow">{trainingState.programName}</p>
            <h1>今日のAIトレーニング</h1>
            <p>今の仕事と経験に合わせて、今日必要な課題を一つだけお届けします。</p>
          </header>
          <AiTrainingCard
            serviceSlug={serviceSlug}
            initialState={{
              enrollmentId: trainingState.enrollmentId,
              programName: trainingState.programName,
              enrollmentStatus: trainingState.enrollmentStatus,
              startsAt: trainingState.startsAt.toISOString(),
              endsAt: trainingState.endsAt?.toISOString() ?? null,
              profile: trainingState.profile,
              goal: trainingState.goal,
              action: trainingState.action
                ? {
                    id: trainingState.action.id,
                    sequence: trainingState.action.sequence,
                    actionKey: trainingState.action.actionKey,
                    mode: trainingState.action.mode,
                    status: trainingState.action.status,
                    display: {
                      title: trainingState.action.display.title,
                      reason: trainingState.action.display.reason,
                      task: trainingState.action.display.task,
                      instructions: trainingState.action.display.instructions,
                      estimatedMinutes: trainingState.action.display.estimatedMinutes,
                    },
                    reevaluateAt: trainingState.action.reevaluateAt?.toISOString() ?? null,
                    submission: trainingState.action.submission,
                  }
                : null,
            }}
          />
          <a className="button button--secondary button--full" href={`/s/${serviceSlug}/programs`}>
            参加中のプログラムへ戻る
          </a>
        </main>
      </PublicShell>
    );
  }

  const participant = new AiResaleParticipantService(
    new db.PrismaAiResaleParticipantRepository(db.prisma),
    new db.PrismaAiResaleRuntimeRepository(db.prisma),
    new AiResaleV1Policy(),
  );
  let state;
  try {
    state = await participant.current({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId,
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof ResalePersistenceError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const offer =
    state.enrollmentStatus === 'COMPLETED' && state.policyKey === 'FREE_7D'
      ? await new AiResaleOfferService(new db.PrismaAiResaleOfferRepository(db.prisma)).current({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          actorUserId: actor.userId,
          freeEnrollmentId: programEnrollmentId,
          now: new Date(),
        })
      : null;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="service-entry resale-action-page" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">{state.programName}</p>
          <h1>今日の一歩</h1>
          <p>一度に全部やる必要はありません。表示されたことを一つだけ進めます。</p>
        </header>
        <AiResaleActionCard
          serviceSlug={serviceSlug}
          initialOffer={offer}
          initialState={{
            enrollmentId: state.enrollmentId,
            programName: state.programName,
            enrollmentStatus: state.enrollmentStatus,
            policyKey: state.policyKey,
            programDay: state.programDay,
            startsAt: state.startsAt.toISOString(),
            endsAt: state.endsAt?.toISOString() ?? null,
            classification: state.classification,
            action: state.action
              ? {
                  id: state.action.id,
                  sequence: state.action.sequence,
                  actionKey: state.action.actionKey,
                  mode: state.action.mode,
                  status: state.action.status,
                  display: {
                    title: state.action.display.title,
                    reason: state.action.display.reason,
                    steps: state.action.display.steps,
                    estimatedMinutes: state.action.display.estimatedMinutes,
                  },
                  reevaluateAt: state.action.reevaluateAt?.toISOString() ?? null,
                }
              : null,
          }}
        />
        <a className="button button--secondary button--full" href={`/s/${serviceSlug}/programs`}>
          参加中のプログラムへ戻る
        </a>
      </main>
    </PublicShell>
  );
}
