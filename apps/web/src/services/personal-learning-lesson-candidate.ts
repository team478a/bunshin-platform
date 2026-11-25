import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import {
  executePersonalLearningTextOperation,
  parsePersonalLearningCallAdmissionPolicy,
  reservePersonalLearningCallCost,
  type PersonalLearningActor,
} from '@bunshin/application';
import { settleProviderRuntimeAdmission } from '../ai/runtime-provider-configuration';
import {
  reserveLearningProviderRuntimeConfiguration,
  resolveLearningProviderRuntimeConfiguration,
  type LearningAiRuntimeConfiguration,
} from '../ai/learning-provider-runtime';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import { generateLearningLesson, learningLessonBody } from '../providers/openai-learning-lesson';
import { learningProposalPolicy } from '../providers/learning-proposal-policy';
import { resolvePersonalLearningOfferContext } from './personal-learning-extended-scope';
import { loadPersonalLearningToolFeatureContext } from './personal-learning-tool-feature-context';

export async function prepareLearningLesson(
  actor: PersonalLearningActor,
  requestId: string,
  requestRevision: number,
  operationId: string,
) {
  const db = await import('@bunshin/database');
  const candidates = new db.PrismaLearningCandidateRepository(db.prisma);
  const request = await new db.PrismaPersonalLearningRequestRepository(db.prisma).readRequest(
    actor,
  );
  if (request?.id !== requestId || request.revision !== requestRevision)
    throw new ApplicationError('CONFLICT', 'learning wish changed');
  const prior = await candidates.readCandidate(actor);
  if (prior) return prior; // Retry and revisit do not create another AI call.
  let configuration: unknown;
  try {
    configuration = JSON.parse(process.env['PERSONAL_LEARNING_LESSON_ADMISSION'] ?? 'null');
  } catch {
    throw new ApplicationError('CONFIGURATION_ERROR', 'lesson admission unavailable');
  }
  const policy = parsePersonalLearningCallAdmissionPolicy(configuration);
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
  const { offerPolicy, extendedScope, browserMaterials } =
    await resolvePersonalLearningOfferContext(actor);
  const includeIntentAnalysis =
    provider === 'google' &&
    process.env['APP_ENV'] === 'development' &&
    offerPolicy === 'AI_SKILL_V1' &&
    browserMaterials;

  const proposalPolicy = learningProposalPolicy(extendedScope, offerPolicy);
  const promptVersion = includeIntentAnalysis
    ? proposalPolicy.version + '-intent-v1'
    : proposalPolicy.version;
  const personaContext = await new db.PrismaPersonalLearningPersonaRepository(db.prisma).listForAi(
    actor.scope,
  );
  const toolFeatureContext = await loadPersonalLearningToolFeatureContext(db, actor, request);
  const body = learningLessonBody(
    request,
    policy.model,
    policy,
    extendedScope,
    personaContext,
    toolFeatureContext,
    offerPolicy,
    includeIntentAnalysis,
  ); // Validate byte limit before admission.
  let providerAdmission: LearningAiRuntimeConfiguration | null = null;
  let usageKey = '';
  let permitId = '';
  let proposal;
  try {
    proposal = await executePersonalLearningTextOperation(
      new db.PrismaPersonalLearningTextOperationRepository(db.prisma),
      {
        actor,
        requestId,
        expectedRequestRevision: requestRevision,
        operationId,
        operationKind: 'LESSON_GENERATION',
        attempt: 1,
        provider,
        promptVersion,
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
        const result = await generateLearningLesson({
          apiKey: providerAdmission.apiKey,
          model: providerAdmission.model,
          provider: providerAdmission.provider,
          modelCapabilities: providerAdmission.modelCapabilities,
          body,
        });
        if (includeIntentAnalysis && result.value && !result.value.intentAnalysis) {
          return {
            ...result,
            value: null,
            measurement: {
              ...result.measurement,
              success: false,
              errorCategory: 'INVALID_RESPONSE' as const,
              validationResult: 'FAILED' as const,
            },
          };
        }
        return result;
      },
    );
  } finally {
    // Close the global Provider reservation only after durable known cost + complete response.
    const admission = providerAdmission as LearningAiRuntimeConfiguration | null;
    if (admission?.admission && permitId) {
      const cost = await db.prisma.personalLearningCallAdmission.findUnique({
        where: { id: permitId },
        select: { settledAt: true },
      });
      if (cost?.settledAt) await settleProviderRuntimeAdmission(admission.admission);
    }
  }
  if (!proposal) throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'lesson unavailable');
  return candidates.save({
    actor,
    request,
    proposal,
    usageKey,
    promptVersion,
    toolFeatureSources: toolFeatureContext.sources.map(({ title, sourceTitle, sourceUrl }) => ({
      title,
      sourceTitle,
      sourceUrl,
    })),
  });
}
