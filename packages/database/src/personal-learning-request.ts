import { createHash } from 'node:crypto';
import { ApplicationError } from '@bunshin/shared';
import {
  validateSavePersonalLearningRequest,
  type PersonalLearningActor,
  type PersonalLearningRequestRepository,
  type SavedPersonalLearningRequest,
  type SavePersonalLearningRequest,
} from '@bunshin/application';
import {
  isPersonalLearningPilotProgram,
  TRAINING_EXPORT_MAX_ROWS,
} from '@bunshin/capability-training';
import type { Prisma } from '@prisma/client';
import { PrismaPersonalLearningPersistenceRepository } from './personal-learning-persistence';

function project(
  row: Prisma.PersonalLearningRequestGetPayload<object>,
): SavedPersonalLearningRequest {
  return {
    id: row.id,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    originalText: row.originalText,
    deviceType: row.deviceType as SavedPersonalLearningRequest['deviceType'],
    toolDescription: row.toolDescription,
    experienceDescription: row.experienceDescription,
    currentPosition: row.currentPosition,
  };
}
/** Reuses enrollment lock and five-axis authorization; no Provider calls or Goal mutation. */
export class PrismaPersonalLearningRequestRepository
  extends PrismaPersonalLearningPersistenceRepository
  implements PersonalLearningRequestRepository
{
  protected async normalLearner(tx: Prisma.TransactionClient, input: PersonalLearningActor) {
    const s = input.scope;
    const member = await tx.groupMembership.findUnique({ where: { id: s.groupMembershipId } });
    const enrollment = await tx.programEnrollment.findUnique({
      where: { id: s.programEnrollmentId },
    });
    const program =
      enrollment &&
      (await tx.serviceProgram.findUnique({ where: { id: enrollment.serviceProgramId } }));
    if (
      member?.serviceRole !== 'PARTICIPANT' ||
      !program ||
      isPersonalLearningPilotProgram(program.settings)
    )
      throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
  }
  readRequest(input: PersonalLearningActor) {
    return this.authorized(input, true, async (tx) => {
      await this.normalLearner(tx, input);
      const row = await tx.personalLearningRequest.findFirst({
        where: input.scope,
        orderBy: { revision: 'desc' },
      });
      return row ? project(row) : null;
    });
  }
  saveRequest(input: SavePersonalLearningRequest) {
    validateSavePersonalLearningRequest(input);
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          expectedRevision: input.expectedRevision,
          originalText: input.content.originalText,
          deviceType: input.content.deviceType,
          toolDescription: input.content.toolDescription,
          experienceDescription: input.content.experienceDescription,
          currentPosition: input.content.currentPosition,
        }),
      )
      .digest('hex');
    return this.authorized(input, true, async (tx) => {
      await this.normalLearner(tx, input);
      const previous = await tx.personalLearningRequest.findFirst({
        where: { ...input.scope, idempotencyKey: input.idempotencyKey },
      });
      if (previous) {
        if (previous.digest !== digest)
          throw new ApplicationError('CONFLICT', 'request key reused');
        return project(previous);
      }
      const latest = await tx.personalLearningRequest.findFirst({
        where: input.scope,
        orderBy: { revision: 'desc' },
      });
      if (
        (latest?.revision ?? 0) !== input.expectedRevision ||
        input.expectedRevision >= TRAINING_EXPORT_MAX_ROWS
      )
        throw new ApplicationError('CONFLICT', 'learning request changed; reload before saving');
      return project(
        await tx.personalLearningRequest.create({
          data: {
            ...input.scope,
            ...input.content,
            revision: input.expectedRevision + 1,
            idempotencyKey: input.idempotencyKey,
            digest,
          },
        }),
      );
    });
  }
}
