import 'server-only';
import {
  estimateAiCallCost,
  parseAiTokenPricingRegistry,
  type AiCallMeasurement,
  type PersonalLearningActor,
} from '@bunshin/application';
import { createLogger } from '@bunshin/observability';

const logger = createLogger();
/** Review before configuring. No default prices, model aliases, or live price lookup. */
export function personalLearningPricingRegistry() {
  try {
    return parseAiTokenPricingRegistry(
      JSON.parse(process.env['PERSONAL_LEARNING_AI_PRICING'] ?? '[]'),
    );
  } catch {
    logger.error('Personal Learning pricing unavailable', {
      errorCode: 'PERSONAL_LEARNING_PRICING_INVALID',
    });
    return [];
  }
}
export async function preparePersonalLearningAiCall(
  actor: PersonalLearningActor,
  assignmentId: string,
  answerId: string,
) {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaPersonalLearningAiCallRepository(db.prisma);
  await repository.resolve(actor, assignmentId, answerId);
  const registry = personalLearningPricingRegistry();
  return {
    cost: (measurement: AiCallMeasurement) => estimateAiCallCost(measurement, registry),
    async record(usageKey: string, measurement: AiCallMeasurement) {
      try {
        await repository.record({ actor, assignmentId, answerId, usageKey, measurement, registry });
      } catch {
        logger.error('Personal Learning AI call persistence failed', {
          errorCode: 'PERSONAL_LEARNING_AI_CALL_PERSISTENCE_FAILED',
        });
      }
    },
  };
}
