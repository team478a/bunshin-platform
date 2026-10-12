import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import {
  executePersonalLearningTextOperation,
  parsePersonalLearningCallAdmissionPolicy,
  reservePersonalLearningCallCost,
  validatePracticeSupportCommand,
  type PracticeSupportCommand,
} from '@bunshin/application';
import {
  resolveOpenAiRuntimeConfiguration,
  reserveOpenAiRuntimeConfiguration,
  settleProviderRuntimeAdmission,
  type AdmittedOpenAiRuntimeConfiguration,
} from '../ai/runtime-provider-configuration';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import {
  generateLearningSupport,
  learningSupportBody,
  LEARNING_SUPPORT_PROMPT_VERSION,
} from '../providers/openai-learning-support';

export async function requestPracticeSupport(command: PracticeSupportCommand) {
  validatePracticeSupportCommand(command);
  const db = await import('@bunshin/database');
  const repo = new db.PrismaPracticeSupportRepository(db.prisma);
  const prepared = await repo.prepareSupport(command);
  if (!prepared.created) {
    if (prepared.request.status === 'READY') return prepared.practice;
    throw new ApplicationError('CONFLICT', 'support attempt already processed or pending');
  }
  let providerAdmission: AdmittedOpenAiRuntimeConfiguration | null = null;
  let permitId = '';
  let usageKey = '';
  try {
    // Reuse the existing common Program limits; no hidden/default price or second budget.
    let configuration: unknown;
    try {
      configuration = JSON.parse(process.env['PERSONAL_LEARNING_LESSON_ADMISSION'] ?? 'null');
    } catch {
      throw new ApplicationError('CONFIGURATION_ERROR', 'support admission unavailable');
    }
    const policy = parsePersonalLearningCallAdmissionPolicy(configuration);
    if (
      !policy ||
      policy.workspaceId !== command.actor.scope.workspaceId ||
      policy.groupId !== command.actor.scope.groupId
    )
      throw new ApplicationError('CONFIGURATION_ERROR', 'support admission unavailable');
    const runtime = await resolveOpenAiRuntimeConfiguration(undefined, 'LEARNING_SUPPORT');
    if (runtime.model !== policy.model)
      throw new ApplicationError('CONFIGURATION_ERROR', 'support model mismatch');
    const pricingRegistry = personalLearningPricingRegistry();
    if (
      !reservePersonalLearningCallCost({
        policy,
        provider: 'openai',
        pricingRegistry,
        occurredAt: new Date(),
      })
    )
      throw new ApplicationError('CONFIGURATION_ERROR', 'support price unavailable');
    const body = learningSupportBody(prepared.practice, prepared.request, policy.model, policy);
    const value = await executePersonalLearningTextOperation(
      new db.PrismaPersonalLearningTextOperationRepository(db.prisma),
      {
        actor: command.actor,
        requestId: prepared.practice.candidate.requestId,
        expectedRequestRevision: prepared.practice.candidate.requestRevision,
        operationId: command.operationId,
        operationKind: 'PRACTICE_SUPPORT',
        attempt: 1,
        provider: 'openai',
        promptVersion: LEARNING_SUPPORT_PROMPT_VERSION,
        policy,
        pricingRegistry,
        practice: {
          assignmentId: command.assignmentId,
          noteRevision: prepared.request.noteRevision,
          supportRevision: prepared.request.revision,
          supportRequestId: prepared.request.id,
        },
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
          throw new ApplicationError('CONFIGURATION_ERROR', 'support reservation unavailable');
        providerAdmission = await reserveOpenAiRuntimeConfiguration(
          usageKey,
          undefined,
          'LEARNING_SUPPORT',
          Number(frozen.reservedCostUsdMicros),
          1,
        );
        if (providerAdmission.model !== policy.model)
          throw new ApplicationError('CONFIGURATION_ERROR', 'support model changed');
        return generateLearningSupport({
          apiKey: providerAdmission.apiKey,
          model: providerAdmission.model,
          body,
        });
      },
    );
    if (!value) throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'support unavailable');
    return await repo.completeSupport({
      command,
      requestId: prepared.request.id,
      advice: value,
      usageKey,
      promptVersion: LEARNING_SUPPORT_PROMPT_VERSION,
    });
  } catch (error) {
    // Reauthorization may deny failure-state writes after expiry/deletion. Do not mask that failure.
    await repo.failSupport({ command, requestId: prepared.request.id });
    throw error;
  } finally {
    const admission = providerAdmission as AdmittedOpenAiRuntimeConfiguration | null;
    if (admission?.admission && permitId) {
      const cost = await db.prisma.personalLearningCallAdmission.findUnique({
        where: { id: permitId },
        select: { settledAt: true },
      });
      if (cost?.settledAt) await settleProviderRuntimeAdmission(admission.admission);
    }
  }
}
