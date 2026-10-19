import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import {
  executePersonalLearningTextOperation,
  parsePersonalLearningCallAdmissionPolicy,
  type PersonalLearningConversationCommand,
} from '@bunshin/application';
import { settleProviderRuntimeAdmission } from '../ai/runtime-provider-configuration';
import {
  resolveLearningProviderRuntimeConfiguration,
  reserveLearningProviderRuntimeConfiguration,
  type LearningAiRuntimeConfiguration,
} from '../ai/learning-provider-runtime';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import {
  generateLearningConversation,
  learningConversationBody,
  learningConversationPromptVersion,
} from '../providers/openai-learning-conversation';
import { resolvePersonalLearningExtendedScope } from './personal-learning-extended-scope';

export async function sendPersonalLearningConversationTurn(
  command: PersonalLearningConversationCommand,
) {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaPersonalLearningConversationRepository(db.prisma);
  const candidates = new db.PrismaLearningCandidateRepository(db.prisma);
  const candidate = await candidates.readCandidate(command.actor);
  const extendedScope = await resolvePersonalLearningExtendedScope(command.actor);
  const promptVersion = learningConversationPromptVersion(extendedScope);
  const currentPractice = (await repository.readPractice(command.actor)).current;
  const personaContext = await new db.PrismaPersonalLearningPersonaRepository(db.prisma).listForAi(
    command.actor.scope,
  );
  const practice = currentPractice
    ? {
        startedAt: currentPractice.startedAt,
        outcome: currentPractice.candidate.proposal.outcome,
        practice: currentPractice.candidate.proposal.practice,
        latestNote: currentPractice.note?.text.slice(0, 500) ?? null,
        latestSubmission: currentPractice.submissions.at(-1)?.content.slice(0, 1600) ?? null,
        latestSupport:
          currentPractice.support.history
            .filter((item) => item.status === 'READY')
            .at(-1)
            ?.advice?.nextAction.slice(0, 600) ?? null,
      }
    : null;
  const prepared = await repository.prepareTurn(command);
  if (!prepared.created) {
    const state = await repository.readConversation(command.actor);
    if (!state) throw new ApplicationError('CONFLICT', 'learning conversation unavailable');
    return { conversation: state, candidate: await candidates.readCandidate(command.actor) };
  }

  let runtimeAdmission: LearningAiRuntimeConfiguration | null = null;
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
    const provider = policy.provider ?? 'openai';
    const initialRuntime = await resolveLearningProviderRuntimeConfiguration(
      provider,
      'LEARNING_CONVERSATION',
    );
    if (initialRuntime.model !== policy.model)
      throw new ApplicationError('CONFIGURATION_ERROR', 'conversation model mismatch');
    const body = learningConversationBody({
      request,
      history: prepared.context,
      currentMessage: command.text,
      candidate,
      practice,
      model: policy.model,
      permit: policy,
      extendedScope,
      personaContext,
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
        provider,
        promptVersion,
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
        runtimeAdmission = await reserveLearningProviderRuntimeConfiguration(
          usageKey,
          provider,
          'LEARNING_CONVERSATION',
          Number(frozen.reservedCostUsdMicros),
          1,
        );
        if (runtimeAdmission.model !== policy.model)
          throw new ApplicationError('CONFIGURATION_ERROR', 'conversation model changed');
        return generateLearningConversation({
          apiKey: runtimeAdmission.apiKey,
          model: runtimeAdmission.model,
          provider: runtimeAdmission.provider,
          modelCapabilities: runtimeAdmission.modelCapabilities,
          body,
        });
      },
    );
    if (!value) throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'conversation unavailable');
    const conversation = await repository.completeTurn({
      command,
      response: value.message,
      responseStatus: value.status,
      ...(candidate?.proposal.status === 'NEEDS_CONTEXT' && value.regeneratedProposal
        ? {
            regeneratedCandidate: {
              expectedCandidateId: candidate.id,
              proposal: value.regeneratedProposal,
              environmentCapture: value.environmentCapture,
            },
          }
        : {}),
      promptVersion,
      usageKey,
    });
    await (
      await import('./personal-learning-persona-inference')
    ).inferPersonalLearningPersonaAfterSuccess({
      actor: command.actor,
      requestId: command.requestId,
      requestRevision: command.requestRevision,
    });
    return { conversation, candidate: await candidates.readCandidate(command.actor) };
  } catch (error) {
    await repository.failTurn(command);
    throw error;
  } finally {
    const admission = runtimeAdmission as LearningAiRuntimeConfiguration | null;
    if (admission?.admission && permitId) {
      const cost = await db.prisma.personalLearningCallAdmission.findUnique({
        where: { id: permitId },
        select: { settledAt: true },
      });
      if (cost?.settledAt) await settleProviderRuntimeAdmission(admission.admission);
    }
  }
}
