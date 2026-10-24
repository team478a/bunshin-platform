import 'server-only';
import type { PersonalLearningActor } from '@bunshin/application';
import {
  SIDE_HUSTLE_EXCLUDED_AREAS,
  SIDE_HUSTLE_PERIODS,
  assertSideHustleRoadmapRevisionPreservesCompletedMonths,
  type SideHustleCandidate,
  validateSideHustleHearing,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import {
  executePersonalLearningTextOperation,
  parsePersonalLearningCallAdmissionPolicy,
  reservePersonalLearningCallCost,
} from '@bunshin/application';
import { settleProviderRuntimeAdmission } from '../ai/runtime-provider-configuration';
import {
  reserveLearningProviderRuntimeConfiguration,
  resolveLearningProviderRuntimeConfiguration,
  type LearningAiRuntimeConfiguration,
} from '../ai/learning-provider-runtime';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import {
  generateSideHustleRoadmap,
  sideHustleRoadmapRevisionBody,
} from '../providers/openai-side-hustle-roadmap';
import { personalLearningOfferPromptPolicy } from '../providers/personal-learning-offer-policy';
import { LEARNING_CONVERSATION_SAFETY_POLICY } from '../providers/learning-proposal-policy';
import { resolvePersonalLearningOfferContext } from './personal-learning-extended-scope';

export async function prepareSideHustleRoadmapRevision(
  actor: PersonalLearningActor,
  input: { topicId: string; checkinEventId: string; operationId: string },
) {
  if (actor.topicId !== undefined)
    throw new ApplicationError('NOT_FOUND', 'side hustle unavailable');
  const db = await import('@bunshin/database');
  const repository = new db.PrismaSideHustleHearingRepository(db.prisma);
  const state = await repository.readState(actor);
  if (
    !state.started ||
    !state.selection ||
    !state.roadmap ||
    state.started.topicId !== input.topicId
  )
    throw new ApplicationError('CONFLICT', 'side hustle state changed');
  const replay = await repository.readRoadmapRevisionProposal(actor, input);
  if (replay) return replay;
  const topicActor: PersonalLearningActor = { ...actor, topicId: input.topicId };
  const progress = await repository.readProgress(topicActor, input.topicId);
  if (!SIDE_HUSTLE_PERIODS.includes(progress.period as (typeof SIDE_HUSTLE_PERIODS)[number]))
    throw new ApplicationError('CONFLICT', 'side hustle roadmap already completed');
  const checkin = progress.lastCheckin as {
    id?: string;
    topicId?: string;
    period?: string;
    decision?: string;
    checkpointResults?: readonly string[];
    feeling?: string;
    note?: string | null;
  } | null;
  if (
    !checkin ||
    checkin.id !== input.checkinEventId ||
    checkin.period !== progress.period ||
    checkin.decision !== 'REVISE'
  )
    throw new ApplicationError('CONFLICT', 'revision checkin unavailable');
  const { offerPolicy } = await resolvePersonalLearningOfferContext(actor);
  if (offerPolicy !== 'SIDE_HUSTLE_V1')
    throw new ApplicationError('NOT_FOUND', 'side hustle unavailable');
  const prompts = personalLearningOfferPromptPolicy(offerPolicy);
  if (!('roadmapRevision' in prompts))
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'side hustle roadmap revision policy unavailable',
    );
  const prompt = prompts.roadmapRevision;
  const candidate = state.selection.candidate as SideHustleCandidate;
  const hearing = state.hearing?.hearing;
  if (!hearing) throw new ApplicationError('CONFLICT', 'side hustle hearing unavailable');
  let configValue: unknown;
  try {
    configValue = JSON.parse(
      process.env['PERSONAL_LEARNING_LESSON_ADMISSION'] ?? 'null',
    ) as unknown;
  } catch {
    throw new ApplicationError('CONFIGURATION_ERROR', 'lesson admission unavailable');
  }
  const policy = parsePersonalLearningCallAdmissionPolicy(configValue);
  if (
    !policy ||
    policy.workspaceId !== actor.scope.workspaceId ||
    policy.groupId !== actor.scope.groupId
  )
    throw new ApplicationError('CONFIGURATION_ERROR', 'lesson admission unavailable');
  const provider = policy.provider ?? 'openai';
  const runtime = await resolveLearningProviderRuntimeConfiguration(provider, 'LEARNING_LESSON');
  if (runtime.model !== policy.model)
    throw new ApplicationError('CONFIGURATION_ERROR', 'lesson model mismatch');
  const pricingRegistry = personalLearningPricingRegistry();
  const reservation = reservePersonalLearningCallCost({
    policy,
    provider,
    pricingRegistry,
    occurredAt: new Date(),
  });
  if (!reservation) throw new ApplicationError('CONFIGURATION_ERROR', 'lesson price unavailable');
  const body = sideHustleRoadmapRevisionBody({
    model: policy.model,
    safetyPolicy: LEARNING_CONVERSATION_SAFETY_POLICY,
    instructions: prompt.instructions,
    selectedSideHustle: candidate,
    hearing: validateSideHustleHearing(hearing),
    baseRoadmap: state.roadmap.roadmap,
    fromPeriod: progress.period,
    checkin: {
      checkpointResults: checkin.checkpointResults ?? [],
      feeling: checkin.feeling ?? 'OK',
      note: checkin.note ?? null,
    },
    verifiedPracticeCount: progress.verifiedPracticeCount,
    excludedAreas: SIDE_HUSTLE_EXCLUDED_AREAS.map(({ label, reason }) => ({ label, reason })),
  });
  if (Buffer.byteLength(body, 'utf8') > policy.maxRequestBytes)
    throw new ApplicationError('VALIDATION_ERROR', 'side hustle request too large');
  let attempt = 1;
  for (; attempt <= 3; attempt += 1) {
    const operationHash = db.personalLearningOperationHash({
      actor,
      operationId: input.operationId,
      attempt,
      operationKind: 'SIDE_HUSTLE_ROADMAP_REVISION',
    });
    const prior = await db.prisma.personalLearningCallAdmission.findFirst({
      where: {
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
        serviceProgramId: policy.serviceProgramId,
        operationHash,
      },
      select: { settledAt: true, operationContext: true },
    });
    if (!prior) break;
    const context =
      prior.operationContext &&
      typeof prior.operationContext === 'object' &&
      !Array.isArray(prior.operationContext)
        ? (prior.operationContext as Record<string, unknown>)
        : {};
    const measurement =
      context['measurement'] && typeof context['measurement'] === 'object'
        ? (context['measurement'] as Record<string, unknown>)
        : {};
    if (!prior.settledAt || measurement['success'] !== false || attempt === 3)
      throw new ApplicationError('CONFLICT', 'roadmap revision operation is not retryable');
  }
  if (attempt > 3) throw new ApplicationError('CONFLICT', 'roadmap revision attempts exhausted');
  let providerAdmission: LearningAiRuntimeConfiguration | null = null;
  let usageKey = '';
  let permitId = '';
  let output;
  try {
    output = await executePersonalLearningTextOperation(
      new db.PrismaPersonalLearningTextOperationRepository(db.prisma),
      {
        actor,
        requestId: state.selection.id,
        expectedRequestRevision: 1,
        operationId: input.operationId,
        operationKind: 'SIDE_HUSTLE_ROADMAP_REVISION',
        attempt,
        provider,
        promptVersion: prompt.version,
        policy,
        pricingRegistry,
      },
      async (permit) => {
        usageKey = `personal-learning-operation:${permit.operationHash}`;
        permitId = permit.id;
        const frozen = await db.prisma.personalLearningCallAdmission.findUnique({
          where: { id: permit.id },
          select: { reservedCostUsdMicros: true },
        });
        if (
          frozen?.reservedCostUsdMicros == null ||
          frozen.reservedCostUsdMicros < 1n ||
          frozen.reservedCostUsdMicros > BigInt(Number.MAX_SAFE_INTEGER)
        )
          throw new ApplicationError('CONFIGURATION_ERROR', 'lesson reservation unavailable');
        providerAdmission = await reserveLearningProviderRuntimeConfiguration(
          usageKey,
          provider,
          'LEARNING_LESSON',
          Number(frozen.reservedCostUsdMicros),
          1,
        );
        if (providerAdmission.model !== policy.model)
          throw new ApplicationError('CONFIGURATION_ERROR', 'lesson model changed');
        return generateSideHustleRoadmap({
          apiKey: providerAdmission.apiKey,
          model: providerAdmission.model,
          provider: providerAdmission.provider,
          modelCapabilities: providerAdmission.modelCapabilities,
          body,
          weeklyHours: hearing.conditions.weeklyHours ?? candidate.weeklyHoursMin,
        });
      },
    );
  } finally {
    const admission = providerAdmission as LearningAiRuntimeConfiguration | null;
    if (admission?.admission && permitId) {
      const cost = await db.prisma.personalLearningCallAdmission.findUnique({
        where: { id: permitId },
        select: { settledAt: true },
      });
      if (cost?.settledAt) await settleProviderRuntimeAdmission(admission.admission);
    }
  }
  if (!output)
    throw new ApplicationError(
      'AI_PROVIDER_UNAVAILABLE',
      'side hustle roadmap revision unavailable',
    );
  try {
    assertSideHustleRoadmapRevisionPreservesCompletedMonths({
      base: state.roadmap.roadmap,
      revision: output,
      fromPeriod: progress.period as (typeof SIDE_HUSTLE_PERIODS)[number],
    });
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'completed roadmap month changed');
  }
  return repository.saveRoadmapRevisionProposal({
    actor,
    topicId: input.topicId,
    selectionEventId: state.selection.id,
    baseRoadmapEventId: state.roadmap.id,
    fromPeriod: progress.period as (typeof SIDE_HUSTLE_PERIODS)[number],
    checkinEventId: input.checkinEventId,
    operationId: input.operationId,
    roadmap: output,
    promptVersion: prompt.version,
    usageKey,
  });
}

export async function confirmSideHustleRoadmapRevision(
  actor: PersonalLearningActor,
  input: { topicId: string; revisionProposalEventId: string; operationId: string },
) {
  if (actor.topicId !== undefined)
    throw new ApplicationError('NOT_FOUND', 'side hustle unavailable');
  const db = await import('@bunshin/database');
  const repository = new db.PrismaSideHustleHearingRepository(db.prisma);
  return repository.saveRoadmapRevision({
    actorUserId: actor.scope.userId,
    scope: actor.scope,
    topicId: input.topicId,
    revisionProposalEventId: input.revisionProposalEventId,
    operationId: input.operationId,
  });
}
