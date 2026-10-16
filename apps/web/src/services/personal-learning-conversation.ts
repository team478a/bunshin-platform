import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import {
  executePersonalLearningTextOperation,
  parsePersonalLearningCallAdmissionPolicy,
  type PersonalLearningConversationCommand,
} from '@bunshin/application';
import {
  resolveOpenAiRuntimeConfiguration,
  reserveOpenAiRuntimeConfiguration,
  settleProviderRuntimeAdmission,
  type AdmittedOpenAiRuntimeConfiguration,
} from '../ai/runtime-provider-configuration';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import {
  generateLearningConversation,
  learningConversationBody,
  LEARNING_CONVERSATION_PROMPT_VERSION,
} from '../providers/openai-learning-conversation';

export async function sendPersonalLearningConversationTurn(
  command: PersonalLearningConversationCommand,
) {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaPersonalLearningConversationRepository(db.prisma);
  const prepared = await repository.prepareTurn(command);
  if (!prepared.created) {
    const state = await repository.readConversation(command.actor);
    if (!state) throw new ApplicationError('CONFLICT', 'learning conversation unavailable');
    return state;
  }

  let runtimeAdmission: AdmittedOpenAiRuntimeConfiguration | null = null;
  let permitId = '';
  let usageKey = '';
  try {
    let raw: unknown;
    try {
      raw = JSON.parse(process.env['PERSONAL_LEARNING_LESSON_ADMISSION'] ?? 'null');
    } catch {
      throw new ApplicationError('CONFIGURATION_ERROR', 'conversation admission unavailable');
    }
    const policy = parsePersonalLearningCallAdmissionPolicy(raw);
    if (
      !policy ||
      policy.workspaceId !== command.actor.scope.workspaceId ||
      policy.groupId !== command.actor.scope.groupId
    )
      throw new ApplicationError('CONFIGURATION_ERROR', 'conversation admission unavailable');
    const request = await new db.PrismaPersonalLearningRequestRepository(db.prisma).readRequest(
      command.actor,
    );
    if (
      !request ||
      request.id !== command.requestId ||
      request.revision !== command.requestRevision
    )
      throw new ApplicationError('CONFLICT', 'learning wish changed');
    const initialRuntime = await resolveOpenAiRuntimeConfiguration(
      undefined,
      'LEARNING_CONVERSATION',
    );
    if (initialRuntime.model !== policy.model)
      throw new ApplicationError('CONFIGURATION_ERROR', 'conversation model mismatch');
    const body = learningConversationBody({
      request,
      history: prepared.context,
      currentMessage: command.text,
      model: policy.model,
      permit: policy,
    });
    const value = await executePersonalLearningTextOperation(
      new db.PrismaPersonalLearningTextOperationRepository(db.prisma),
      {
        actor: command.actor,
        requestId: command.requestId,
        expectedRequestRevision: command.requestRevision,
        operationId: command.operationId,
        operationKind: 'CONVERSATION_TURN',
        attempt: 1,
        provider: 'openai',
        promptVersion: LEARNING_CONVERSATION_PROMPT_VERSION,
        policy,
        pricingRegistry: personalLearningPricingRegistry(),
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
          throw new ApplicationError('CONFIGURATION_ERROR', 'conversation reservation unavailable');
        runtimeAdmission = await reserveOpenAiRuntimeConfiguration(
          usageKey,
          undefined,
          'LEARNING_CONVERSATION',
          Number(frozen.reservedCostUsdMicros),
          1,
        );
        if (runtimeAdmission.model !== policy.model)
          throw new ApplicationError('CONFIGURATION_ERROR', 'conversation model changed');
        return generateLearningConversation({
          apiKey: runtimeAdmission.apiKey,
          model: runtimeAdmission.model,
          body,
        });
      },
    );
    if (!value) throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'conversation unavailable');
    return await repository.completeTurn({
      command,
      response: value.message,
      responseStatus: value.status,
      promptVersion: LEARNING_CONVERSATION_PROMPT_VERSION,
      usageKey,
    });
  } catch (error) {
    await repository.failTurn(command);
    throw error;
  } finally {
    const admission = runtimeAdmission as AdmittedOpenAiRuntimeConfiguration | null;
    if (admission?.admission && permitId) {
      const cost = await db.prisma.personalLearningCallAdmission.findUnique({
        where: { id: permitId },
        select: { settledAt: true },
      });
      if (cost?.settledAt) await settleProviderRuntimeAdmission(admission.admission);
    }
  }
}
