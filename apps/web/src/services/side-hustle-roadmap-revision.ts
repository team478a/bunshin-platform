import 'server-only';
import type { PersonalLearningActor } from '@bunshin/application';
import { buildSideHustleRoadmapRevisionRequest } from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';

export async function confirmSideHustleRoadmapRevision(
  actor: PersonalLearningActor,
  input: { topicId: string; roadmapEventId: string; operationId: string },
) {
  if (actor.topicId !== undefined)
    throw new ApplicationError('NOT_FOUND', 'side hustle unavailable');
  const db = await import('@bunshin/database');
  const repository = new db.PrismaSideHustleHearingRepository(db.prisma);
  const state = await repository.readState(actor);
  if (state.started?.topicId !== input.topicId || state.roadmap?.id !== input.roadmapEventId)
    throw new ApplicationError('CONFLICT', 'side hustle roadmap changed');

  const topicActor: PersonalLearningActor = { ...actor, topicId: input.topicId };
  const progress = await repository.readProgress(topicActor, input.topicId);
  if (progress.period === 'COMPLETED')
    throw new ApplicationError('CONFLICT', 'side hustle roadmap already completed');
  const previous = await repository.readRequest(topicActor);
  if (!previous) throw new ApplicationError('CONFLICT', 'side hustle request unavailable');

  const content = buildSideHustleRoadmapRevisionRequest({
    previous,
    roadmap: state.roadmap.roadmap,
    currentPeriod: progress.period,
  });
  return repository.saveRoadmapRevision({
    actorUserId: actor.scope.userId,
    scope: actor.scope,
    topicId: input.topicId,
    expectedRevision: previous.revision,
    content,
    idempotencyKey: `side_hustle_map_revision_${input.operationId}`,
    roadmapEventId: input.roadmapEventId,
    roadmap: state.roadmap.roadmap,
    currentPeriod: progress.period,
  });
}
