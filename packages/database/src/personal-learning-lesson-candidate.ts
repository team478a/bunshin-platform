import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  LEARNING_CANDIDATE_POLICY,
  validateLearningLessonProposal,
  type LearningCandidateRepository,
  type SavedLearningLessonCandidate,
} from '@bunshin/application';
import { PrismaPersonalLearningRequestRepository } from './personal-learning-request';

export class PrismaLearningCandidateRepository
  extends PrismaPersonalLearningRequestRepository
  implements LearningCandidateRepository
{
  readCandidate(actor: Parameters<LearningCandidateRepository['readCandidate']>[0]) {
    return this.authorized(actor, true, async (tx) => {
      await this.normalLearner(tx, actor);
      const row = await tx.personalLearningRequest.findFirst({
        where: { ...actor.scope, ...(actor.topicId ? { topicId: actor.topicId } : {}) },
        orderBy: { revision: 'desc' },
      });
      return row?.lessonCandidate
        ? this.project(row.lessonCandidate, row.candidateConfirmedAt)
        : null;
    });
  }
  protected project(value: Prisma.JsonValue, confirmed: Date | null): SavedLearningLessonCandidate {
    const c = value as unknown as SavedLearningLessonCandidate;
    if (!c || c.policyVersion !== LEARNING_CANDIDATE_POLICY || c.materialVersion !== 1)
      throw new ApplicationError('CONFLICT', 'lesson version unavailable');
    const toolFeatureSources = Array.isArray(c.toolFeatureSources)
      ? c.toolFeatureSources.filter(
          (
            source: unknown,
          ): source is NonNullable<SavedLearningLessonCandidate['toolFeatureSources']>[number] => {
            if (typeof source !== 'object' || source === null || Array.isArray(source))
              return false;
            const record = source as Record<string, unknown>;
            return (
              typeof record['title'] === 'string' &&
              typeof record['sourceTitle'] === 'string' &&
              typeof record['sourceUrl'] === 'string' &&
              record['sourceUrl'].startsWith('https://')
            );
          },
        )
      : [];
    return {
      ...c,
      proposal: validateLearningLessonProposal(c.proposal),
      toolFeatureSources,
      confirmedAt: confirmed?.toISOString() ?? null,
    };
  }
  save(input: Parameters<LearningCandidateRepository['save']>[0]) {
    const proposal = validateLearningLessonProposal(input.proposal);
    if (
      !/^personal-learning-operation:[0-9a-f]{64}$/.test(input.usageKey) ||
      !/^[A-Za-z0-9._-]{1,120}$/.test(input.promptVersion)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid candidate provenance');
    return this.authorized(input.actor, true, async (tx, now) => {
      await this.normalLearner(tx, input.actor);
      const row = await tx.personalLearningRequest.findFirst({
        where: {
          ...input.actor.scope,
          ...(input.actor.topicId ? { topicId: input.actor.topicId } : {}),
        },
        orderBy: { revision: 'desc' },
      });
      if (row?.id !== input.request.id || row.revision !== input.request.revision)
        throw new ApplicationError('CONFLICT', 'learning wish changed');
      if (row.lessonCandidate) return this.project(row.lessonCandidate, row.candidateConfirmedAt);
      const usage = await tx.aiUsageEvent.findFirst({
        where: {
          workspaceId: row.workspaceId,
          actorUserId: row.userId,
          idempotencyKey: input.usageKey,
          status: 'SUCCESS',
          taskType: 'PERSONAL_LEARNING_LESSON_GENERATION',
          estimatedCostUsdMicros: { not: null },
        },
      });
      if (!usage || usage.promptVersion !== input.promptVersion)
        throw new ApplicationError('CONFLICT', 'durable generation cost required');
      // Unknown prerequisites must not become inferred capability or runnable instructions.
      if (proposal.status === 'READY' && (!row.deviceType || !row.toolDescription))
        throw new ApplicationError('VALIDATION_ERROR', 'learning environment required');
      const candidate: SavedLearningLessonCandidate = {
        id: randomUUID(),
        requestId: row.id,
        requestRevision: row.revision,
        originalText: row.originalText,
        policyVersion: LEARNING_CANDIDATE_POLICY,
        materialVersion: 1,
        promptVersion: input.promptVersion,
        usageKey: input.usageKey,
        createdAt: now.toISOString(),
        confirmedAt: null,
        toolFeatureSources: input.toolFeatureSources ?? [],
        proposal,
      };
      await tx.personalLearningRequest.update({
        where: { id: row.id, ...(input.actor.topicId ? { topicId: input.actor.topicId } : {}) },
        data: { lessonCandidate: candidate as unknown as Prisma.InputJsonValue },
      });
      return candidate;
    });
  }
  confirm(input: Parameters<LearningCandidateRepository['confirm']>[0]) {
    return this.authorized(input.actor, true, async (tx, now) => {
      await this.normalLearner(tx, input.actor);
      const row = await tx.personalLearningRequest.findFirst({
        where: {
          ...input.actor.scope,
          ...(input.actor.topicId ? { topicId: input.actor.topicId } : {}),
        },
        orderBy: { revision: 'desc' },
      });
      if (
        !row?.lessonCandidate ||
        row.id !== input.requestId ||
        row.revision !== input.requestRevision
      )
        throw new ApplicationError('CONFLICT', 'learning wish changed');
      const candidate = this.project(row.lessonCandidate, row.candidateConfirmedAt);
      if (candidate.id !== input.candidateId || candidate.proposal.status !== 'READY')
        throw new ApplicationError('CONFLICT', 'candidate not confirmable');
      if (row.candidateConfirmedAt) return candidate;
      await tx.personalLearningRequest.update({
        where: { id: row.id, ...(input.actor.topicId ? { topicId: input.actor.topicId } : {}) },
        data: { candidateConfirmedAt: now },
      });
      return { ...candidate, confirmedAt: now.toISOString() };
    });
  }
}
