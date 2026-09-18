import {
  AiResaleParticipantService,
  AiResaleV1Policy,
  ResalePersistenceError,
} from '@bunshin/capability-resale';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { resolveAuthenticatedMemberServicePage } from '../../../../../src/services/member-service-page';
import { PublicShell } from '../../../../ui/public-shell';
import { AiResaleActionCard } from './ai-resale-action-card';

export const dynamic = 'force-dynamic';

export default async function AiResaleParticipantPage({
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
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;
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
