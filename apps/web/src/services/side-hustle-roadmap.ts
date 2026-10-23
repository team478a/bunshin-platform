import 'server-only';
import {
  executePersonalLearningTextOperation,
  parsePersonalLearningCallAdmissionPolicy,
  reservePersonalLearningCallCost,
  type PersonalLearningActor,
} from '@bunshin/application';
import {
  SIDE_HUSTLE_EXCLUDED_AREAS,
  type SideHustleCandidate,
  sideHustleHearingReadyForProposal,
  validateSideHustleHearing,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { settleProviderRuntimeAdmission } from '../ai/runtime-provider-configuration';
import {
  reserveLearningProviderRuntimeConfiguration,
  resolveLearningProviderRuntimeConfiguration,
  type LearningAiRuntimeConfiguration,
} from '../ai/learning-provider-runtime';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import {
  generateSideHustleRoadmap,
  sideHustleRoadmapBody,
} from '../providers/openai-side-hustle-roadmap';
import { personalLearningOfferPromptPolicy } from '../providers/personal-learning-offer-policy';
import { LEARNING_CONVERSATION_SAFETY_POLICY } from '../providers/learning-proposal-policy';
import { resolvePersonalLearningOfferContext } from './personal-learning-extended-scope';

export async function prepareSideHustleRoadmap(
  actor: PersonalLearningActor,
  selectionEventId: string,
  operationId: string,
) {
  if (actor.topicId !== undefined)
    throw new ApplicationError('NOT_FOUND', 'side hustle unavailable');
  const db = await import('@bunshin/database');
  const repository = new db.PrismaSideHustleHearingRepository(db.prisma);
  const state = await repository.readState(actor);
  if (state.selection?.id !== selectionEventId)
    throw new ApplicationError('CONFLICT', 'side hustle selection changed');
  if (
    state.roadmap?.selectionEventId === selectionEventId &&
    state.roadmap.operationId === operationId
  )
    return state.roadmap;
  const { offerPolicy } = await resolvePersonalLearningOfferContext(actor);
  if (offerPolicy !== 'SIDE_HUSTLE_V1')
    throw new ApplicationError('NOT_FOUND', 'side hustle unavailable');
  const prompts = personalLearningOfferPromptPolicy(offerPolicy);
  if (!('roadmapProposal' in prompts))
    throw new ApplicationError('CONFIGURATION_ERROR', 'side hustle roadmap policy unavailable');
  const prompt = prompts.roadmapProposal;
  const hearingState = state.hearing?.hearing;
  if (!hearingState || !sideHustleHearingReadyForProposal(hearingState))
    throw new ApplicationError('CONFLICT', 'side hustle hearing unavailable');
  const candidate = state.selection.candidate as SideHustleCandidate;
  const configValue = (() => {
    try {
      return JSON.parse(process.env['PERSONAL_LEARNING_LESSON_ADMISSION'] ?? 'null') as unknown;
    } catch {
      throw new ApplicationError('CONFIGURATION_ERROR', 'lesson admission unavailable');
    }
  })();
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
  const body = sideHustleRoadmapBody({
    model: policy.model,
    safetyPolicy: LEARNING_CONVERSATION_SAFETY_POLICY,
    instructions: prompt.instructions,
    selectedSideHustle: candidate,
    hearing: validateSideHustleHearing(hearingState),
    excludedAreas: SIDE_HUSTLE_EXCLUDED_AREAS.map(({ label, reason }) => ({ label, reason })),
  });
  if (Buffer.byteLength(body, 'utf8') > policy.maxRequestBytes)
    throw new ApplicationError('VALIDATION_ERROR', 'side hustle request too large');
  let attempt = 1;
  for (; attempt <= 3; attempt += 1) {
    const operationHash = db.personalLearningOperationHash({
      actor,
      operationId,
      attempt,
      operationKind: 'SIDE_HUSTLE_ROADMAP',
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
      throw new ApplicationError('CONFLICT', 'roadmap operation is not retryable');
  }
  if (attempt > 3) throw new ApplicationError('CONFLICT', 'roadmap attempts exhausted');
  let providerAdmission: LearningAiRuntimeConfiguration | null = null;
  let usageKey = '';
  let permitId = '';
  let output;
  try {
    output = await executePersonalLearningTextOperation(
      new db.PrismaPersonalLearningTextOperationRepository(db.prisma),
      {
        actor,
        requestId: selectionEventId,
        expectedRequestRevision: 1,
        operationId,
        operationKind: 'SIDE_HUSTLE_ROADMAP',
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
          weeklyHours: hearingState.conditions.weeklyHours ?? candidate.weeklyHoursMin,
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
    throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'side hustle roadmap unavailable');
  return repository.saveRoadmap({
    actor,
    selectionEventId,
    roadmap: output,
    promptVersion: prompt.version,
    usageKey,
    idempotencyKey: operationId,
  });
}
