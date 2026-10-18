import 'server-only';
import { createHash } from 'node:crypto';
import type { PersonalLearningActor } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import {
  executePersonalLearningTextOperation,
  parsePersonalLearningCallAdmissionPolicy,
} from '@bunshin/application';
import { createLogger } from '@bunshin/observability';
import {
  resolveOpenAiRuntimeConfiguration,
  reserveOpenAiRuntimeConfiguration,
  settleProviderRuntimeAdmission,
  type AdmittedOpenAiRuntimeConfiguration,
} from '../ai/runtime-provider-configuration';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import {
  generatePersonaInference,
  personaInferenceBody,
  PERSONAL_LEARNING_PERSONA_INFERENCE_PROMPT_VERSION,
  screenPersonaInferenceSources,
  type PersonaInferenceSource,
} from '../providers/openai-learning-persona-inference';

const logger = createLogger();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function dailyOperationId(enrollmentId: string, now: Date) {
  const hash = digest(`${enrollmentId}:${now.toISOString().slice(0, 10)}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function eventText(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const text = (metadata as Record<string, unknown>)['text'];
  return typeof text === 'string' ? text.trim().slice(0, 1200) : '';
}

/** Best-effort after a successful core response; failure is logged without failing learning itself. */
export async function inferPersonalLearningPersonaAfterSuccess(input: {
  actor: PersonalLearningActor;
  requestId: string;
  requestRevision: number;
}) {
  const scope = input.actor.scope;
  const now = new Date();
  try {
    const db = await import('@bunshin/database');
    const persona = new db.PrismaPersonalLearningPersonaRepository(db.prisma);
    const profile = await persona.profile(scope);
    if (!profile?.optedIn) return { outcome: 'NOT_OPTED_IN' as const };
    const lastInferenceAt = await persona.lastSuccessfulInferenceAt(scope);
    const events = await db.prisma.programActionEvent.findMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        actorUserId: scope.userId,
        eventType: {
          in: [
            'PERSONAL_LEARNING_CONVERSATION_MESSAGE',
            'PERSONAL_LEARNING_CONVERSATION_RESPONSE',
            'PERSONAL_LEARNING_SUPPORT_REQUEST',
          ],
        },
        ...(lastInferenceAt ? { createdAt: { gt: lastInferenceAt } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
      select: { id: true, eventType: true, metadata: true, createdAt: true },
    });
    const candidateSources: PersonaInferenceSource[] = events.flatMap((event) => {
      const text = eventText(event.metadata);
      if (!text) return [];
      const evidenceType: PersonaInferenceSource['evidenceType'] =
        event.eventType === 'PERSONAL_LEARNING_SUPPORT_REQUEST'
          ? 'PRACTICE_ANSWER'
          : 'CONVERSATION_EVENT';
      return [
        {
          evidenceType,
          evidenceId: event.id,
          occurredAt: event.createdAt,
          text,
        },
      ];
    });
    // Avoid transmitting likely sensitive or third-party details to the inference provider.
    const sources = screenPersonaInferenceSources(candidateSources).slice(-5);
    if (sources.length === 0) return { outcome: 'NO_NEW_RECORDS' as const };

    let raw: unknown;
    try {
      raw = JSON.parse(process.env['PERSONAL_LEARNING_LESSON_ADMISSION'] ?? 'null');
    } catch {
      throw new ApplicationError('CONFIGURATION_ERROR', 'persona admission unavailable');
    }
    const configured = parsePersonalLearningCallAdmissionPolicy(raw);
    if (
      !configured ||
      configured.workspaceId !== scope.workspaceId ||
      configured.groupId !== scope.groupId
    )
      throw new ApplicationError('CONFIGURATION_ERROR', 'persona admission unavailable');
    const policy = {
      ...configured,
      maxRequestBytes: configured.maxRequestBytes,
      maxOutputTokens: Math.min(configured.maxOutputTokens, 300),
    };
    if (policy.maxOutputTokens < 16)
      throw new ApplicationError('CONFIGURATION_ERROR', 'persona output limit unavailable');
    const runtime = await resolveOpenAiRuntimeConfiguration(undefined, 'LEARNING_LESSON');
    if (runtime.model !== policy.model)
      throw new ApplicationError('CONFIGURATION_ERROR', 'persona model mismatch');
    const body = personaInferenceBody({
      model: policy.model,
      maxOutputTokens: policy.maxOutputTokens,
      maxRequestBytes: policy.maxRequestBytes,
      // The source material itself is limited to 1,000 UTF-8 bytes; this is intentionally stricter than 1,000 tokens.
      maxSourceBytes: 1000,
      sources,
    });
    if (Buffer.byteLength(body, 'utf8') > policy.maxRequestBytes)
      throw new ApplicationError('VALIDATION_ERROR', 'persona request limit exceeded');
    const request = await new db.PrismaPersonalLearningRequestRepository(db.prisma).readRequest(
      input.actor,
    );
    if (!request || request.id !== input.requestId || request.revision !== input.requestRevision)
      throw new ApplicationError('CONFLICT', 'learning request changed');
    let admitted: AdmittedOpenAiRuntimeConfiguration | null = null;
    let permitId = '';
    let usageKey = '';
    try {
      const result = await executePersonalLearningTextOperation(
        new db.PrismaPersonalLearningTextOperationRepository(db.prisma),
        {
          actor: input.actor,
          requestId: input.requestId,
          expectedRequestRevision: input.requestRevision,
          operationId: dailyOperationId(scope.programEnrollmentId, now),
          operationKind: 'PERSONA_INFERENCE',
          attempt: 1,
          provider: 'openai',
          promptVersion: PERSONAL_LEARNING_PERSONA_INFERENCE_PROMPT_VERSION,
          policy,
          pricingRegistry: personalLearningPricingRegistry(),
        },
        async (permit) => {
          permitId = permit.id;
          usageKey = `personal-learning-operation:${permit.operationHash}`;
          const frozen = await db.prisma.personalLearningCallAdmission.findUnique({
            where: { id: permit.id },
            select: { reservedCostUsdMicros: true },
          });
          if (frozen?.reservedCostUsdMicros == null || frozen.reservedCostUsdMicros < 1n)
            throw new ApplicationError('CONFIGURATION_ERROR', 'persona reservation unavailable');
          if (frozen.reservedCostUsdMicros > BigInt(Number.MAX_SAFE_INTEGER))
            throw new ApplicationError('CONFIGURATION_ERROR', 'persona reservation unavailable');
          admitted = await reserveOpenAiRuntimeConfiguration(
            usageKey,
            undefined,
            'LEARNING_LESSON',
            Number(frozen.reservedCostUsdMicros),
            1,
          );
          if (admitted.model !== policy.model)
            throw new ApplicationError('CONFIGURATION_ERROR', 'persona model changed');
          return generatePersonaInference({ apiKey: admitted.apiKey, model: admitted.model, body });
        },
      );
      for (const item of result) {
        const source = sources[item.sourceIndex];
        if (!source) continue;
        await persona.save(scope, {
          attributeKey: item.attributeKey,
          value: item.value,
          evidenceType: source.evidenceType,
          evidenceId: source.evidenceId,
          evidenceCreatedAt: source.occurredAt,
        });
      }
      return { outcome: 'INFERRED' as const };
    } finally {
      const admission = admitted as AdmittedOpenAiRuntimeConfiguration | null;
      if (admission?.admission && permitId) {
        const cost = await db.prisma.personalLearningCallAdmission.findUnique({
          where: { id: permitId },
          select: { settledAt: true },
        });
        if (cost?.settledAt) await settleProviderRuntimeAdmission(admission.admission);
      }
    }
  } catch (error) {
    logger.warn('Personal Learning persona inference skipped or failed', {
      errorCode: error instanceof ApplicationError ? error.code : 'PERSONA_INFERENCE_FAILED',
      enrollmentId: scope.programEnrollmentId,
    });
    return { outcome: 'SKIPPED' as const };
  }
}
