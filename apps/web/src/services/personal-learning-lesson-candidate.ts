import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import {
  executePersonalLearningTextOperation,
  parsePersonalLearningCallAdmissionPolicy,
  reservePersonalLearningCallCost,
  type PersonalLearningActor,
} from '@bunshin/application';
import {
  resolveOpenAiRuntimeConfiguration,
  reserveOpenAiRuntimeConfiguration,
  settleProviderRuntimeAdmission,
  type AdmittedOpenAiRuntimeConfiguration,
} from '../ai/runtime-provider-configuration';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import {
  generateLearningLesson,
  learningLessonBody,
  LEARNING_LESSON_PROMPT_VERSION,
} from '../providers/openai-learning-lesson';

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
  const runtime = await resolveOpenAiRuntimeConfiguration(undefined, 'LEARNING_LESSON');
  if (runtime.model !== policy.model)
    throw new ApplicationError('CONFIGURATION_ERROR', 'lesson model mismatch');
  const pricingRegistry = personalLearningPricingRegistry();
  const reservation = reservePersonalLearningCallCost({
    policy,
    provider: 'openai',
    pricingRegistry,
    occurredAt: new Date(),
  });
  if (!reservation) throw new ApplicationError('CONFIGURATION_ERROR', 'lesson price unavailable');
  const body = learningLessonBody(request, policy.model, policy); // Validate byte limit before admission.
  let providerAdmission: AdmittedOpenAiRuntimeConfiguration | null = null;
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
        provider: 'openai',
        promptVersion: LEARNING_LESSON_PROMPT_VERSION,
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
        providerAdmission = await reserveOpenAiRuntimeConfiguration(
          usageKey,
          undefined,
          'LEARNING_LESSON',
          Number(frozen.reservedCostUsdMicros),
          1,
        );
        if (providerAdmission.model !== policy.model)
          throw new ApplicationError('CONFIGURATION_ERROR', 'lesson model changed');
        return generateLearningLesson({
          apiKey: providerAdmission.apiKey,
          model: providerAdmission.model,
          body,
        });
      },
    );
  } finally {
    // Close the global Provider reservation only after durable known cost + complete response.
    const admission = providerAdmission as AdmittedOpenAiRuntimeConfiguration | null;
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
    promptVersion: LEARNING_LESSON_PROMPT_VERSION,
  });
}
