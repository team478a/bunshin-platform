import 'server-only';
import {
  FortuneGenerationJobError,
  type FortuneGenerationJobHandler,
  type FortuneGenerationJobInput,
} from '@bunshin/application';
import {
  FortunePolicyError,
  validateFortuneReadingOutput,
  type FortuneAiReadingGenerator,
  type FortuneRepository,
} from '@bunshin/capability-fortune';
import { ApplicationError } from '@bunshin/shared';
import { OpenAiFortuneReadingGenerator } from '../providers/openai-fortune-reading-generator';

interface Dependencies {
  repository: Pick<
    FortuneRepository,
    'claimAiGeneration' | 'completeAiGeneration' | 'fallbackAiGeneration'
  >;
  generator: FortuneAiReadingGenerator;
  resolveService(input: FortuneGenerationJobInput): Promise<string | null>;
  isCurrent(
    input: Omit<Parameters<FortuneRepository['completeAiGeneration']>[0], 'output'> & {
      generationRevision: Date;
    },
  ): Promise<boolean>;
}

function generationFailure(error: unknown): FortuneGenerationJobError {
  if (error instanceof FortuneGenerationJobError) return error;
  if (error instanceof FortunePolicyError)
    return new FortuneGenerationJobError('FORTUNE_OUTPUT_REJECTED', false);
  if (error instanceof ApplicationError) {
    if (error.code === 'AI_PROVIDER_UNAVAILABLE') {
      const diagnostic = error.cause as { category?: unknown; status?: unknown } | undefined;
      const retryable =
        diagnostic?.category === 'TIMEOUT_OR_NETWORK' ||
        diagnostic?.status === 429 ||
        (typeof diagnostic?.status === 'number' &&
          diagnostic.status >= 500 &&
          diagnostic.status <= 599);
      return new FortuneGenerationJobError('FORTUNE_PROVIDER_UNAVAILABLE', retryable);
    }
    return new FortuneGenerationJobError(`FORTUNE_${error.code}`, false);
  }
  return new FortuneGenerationJobError('FORTUNE_GENERATION_ERROR', false);
}

async function configuredDependencies(): Promise<Dependencies> {
  const db = await import('@bunshin/database');
  return {
    repository: new db.PrismaFortuneRepository(db.prisma),
    generator: new OpenAiFortuneReadingGenerator(),
    async resolveService(input) {
      const setting = await db.prisma.fortuneServiceSetting.findFirst({
        where: {
          id: input.serviceSettingId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
        },
        select: { configuration: { select: { slug: true } } },
      });
      return setting?.configuration.slug ?? null;
    },
    isCurrent: (input) =>
      input.jobLease
        ? db.verifyFortuneGenerationJob(db.prisma, { ...input, jobLease: input.jobLease })
        : Promise.resolve(false),
  };
}

export function createFortuneGenerationJobHandler(
  dependencies?: Dependencies,
): FortuneGenerationJobHandler {
  return {
    async execute(input) {
      const deps = dependencies ?? (await configuredDependencies());
      const serviceSlug = await deps.resolveService(input);
      if (!serviceSlug) throw new FortuneGenerationJobError('FORTUNE_SCOPE_REVOKED', false);
      const scope = {
        serviceSlug,
        actorUserId: input.actorUserId,
        readingId: input.readingId,
        jobLease: input,
      };
      const claim = await deps.repository.claimAiGeneration(scope);
      // Completed, deleted, recovered, revoked or leased by another worker: never call AI.
      if (!claim) return;
      if (!claim.generationRevision)
        throw new FortuneGenerationJobError('FORTUNE_CLAIM_INVALID', false);
      const revision = { ...scope, generationRevision: claim.generationRevision };
      let output;
      try {
        if (input.attemptCount > Math.min(input.maxAttempts, 3))
          throw new FortuneGenerationJobError('FORTUNE_ATTEMPTS_EXHAUSTED', false);
        output = await deps.generator.generate({
          serviceSlug,
          actorUserId: input.actorUserId,
          claim,
          assertAllowed: async () => {
            // Quota/configuration lookup may wait: recheck immediately before the provider call.
            if (!(await deps.isCurrent(revision)))
              throw new FortuneGenerationJobError('FORTUNE_SCOPE_REVOKED', false);
          },
        });
        output = { ...output, ...validateFortuneReadingOutput(output) };
      } catch (error) {
        const failure = generationFailure(error);
        if (!failure.retryable || input.attemptCount >= Math.min(input.maxAttempts, 3))
          await deps.repository.fallbackAiGeneration({
            ...revision,
            failureCode: failure.category,
          });
        throw new FortuneGenerationJobError(
          failure.category,
          failure.retryable && input.attemptCount < Math.min(input.maxAttempts, 3),
        );
      }
      await deps.repository.completeAiGeneration({ ...revision, output });
    },
  };
}
