import 'server-only';
import { z } from 'zod';
import {
  TRAINING_BARRIER_REASONS,
  TRAINING_SKILL_FACTORY_FEASIBILITY_AXES,
  TRAINING_SKILL_KEYS,
  TRAINING_SUPPORT_SKILL_ROLLBACK_AXES,
} from '@bunshin/capability-training';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  executeTrainingSupportSkillAdmin,
  listTrainingSupportSkillsForAdmin,
} from '../services/ai-training-skill-lifecycle-admin';
import { resolveManagedServiceContext } from '../services/public-service';

const text = (max: number) => z.string().trim().min(1).max(max);
const dateTime = z.iso.datetime({ offset: true });
const feasibilityCheck = z
  .object({
    status: z.enum(['PASSED', 'BLOCKED', 'UNKNOWN']),
    reasonCode: text(80),
    confirmedRevision: text(160),
    checkedAt: dateTime,
  })
  .strict();
const feasibilityChecks = z
  .object(
    Object.fromEntries(
      TRAINING_SKILL_FACTORY_FEASIBILITY_AXES.map((axis) => [axis, feasibilityCheck]),
    ) as Record<(typeof TRAINING_SKILL_FACTORY_FEASIBILITY_AXES)[number], typeof feasibilityCheck>,
  )
  .strict();
const reviewPackage = z
  .object({
    skillKey: text(120).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
    problem: z
      .object({
        problemId: text(160),
        revision: z.number().int().positive(),
        programEnrollmentId: z.uuid(),
        missionAssignmentId: z.uuid(),
        actionEventId: z.uuid(),
        learningObjectiveKey: text(80),
        relevantSuccessCriteriaKeys: z.array(text(80)).max(10),
        barrierReasonCode: z.enum(TRAINING_BARRIER_REASONS).nullable(),
        evaluatedSkillKeys: z.array(z.enum(TRAINING_SKILL_KEYS)).max(6),
      })
      .strict(),
    feasibilityChecks,
    skillDraft: z
      .object({
        skillDraftId: text(160),
        revision: z.number().int().positive(),
        scopeFingerprint: text(160),
        requiredInputKeys: z.array(text(80)).max(20),
        prohibitedInputClasses: z.array(text(80)).max(20),
        steps: z.array(text(200)).min(1).max(5),
        expectedOutput: text(500),
        status: z.enum(['DRAFT', 'VALIDATED', 'APPROVED']),
        expiresAt: dateTime,
      })
      .strict(),
    artifact: z
      .object({
        artifactId: text(160),
        revision: z.number().int().positive(),
        createdAt: dateTime,
        expiresAt: dateTime,
      })
      .strict(),
  })
  .strict();
const commonTransition = {
  skillId: z.uuid(),
  skillVersionId: z.uuid(),
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.uuid(),
};
const rollbackCompatibility = z
  .object(
    Object.fromEntries(
      TRAINING_SUPPORT_SKILL_ROLLBACK_AXES.map((axis) => [
        axis,
        z.enum(['PASSED', 'BLOCKED', 'UNKNOWN']),
      ]),
    ) as Record<
      (typeof TRAINING_SUPPORT_SKILL_ROLLBACK_AXES)[number],
      z.ZodEnum<{ PASSED: 'PASSED'; BLOCKED: 'BLOCKED'; UNKNOWN: 'UNKNOWN' }>
    >,
  )
  .strict();
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('PREVIEW'), reviewPackage }).strict(),
  z
    .object({
      action: z.literal('APPROVE'),
      reviewPackage,
      expectedRevision: z.number().int().nonnegative(),
      idempotencyKey: z.uuid(),
      confirmation: z.literal('APPROVE_PROBLEM_AND_SKILL_VERSION'),
    })
    .strict(),
  z
    .object({
      action: z.literal('ACTIVATE'),
      ...commonTransition,
      confirmation: z.literal('ACTIVATE_SKILL_VERSION'),
    })
    .strict(),
  z
    .object({
      action: z.literal('SUSPEND'),
      skillId: z.uuid(),
      expectedRevision: z.number().int().positive(),
      idempotencyKey: z.uuid(),
      reasonCode: z.enum([
        'SAFETY_REVIEW_REQUIRED',
        'OUTCOME_REVIEW_REQUIRED',
        'MANUAL_OPERATIONAL_STOP',
      ]),
      confirmation: z.literal('SUSPEND_SKILL'),
    })
    .strict(),
  z
    .object({
      action: z.literal('ROLLBACK'),
      ...commonTransition,
      reasonCode: z.enum([
        'CURRENT_VERSION_REGRESSION',
        'CURRENT_VERSION_INCOMPATIBLE',
        'MANUAL_VERSION_RESTORE',
      ]),
      compatibility: rollbackCompatibility,
      confirmation: z.literal('ROLLBACK_SKILL_VERSION'),
    })
    .strict(),
]);

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

async function managedContext(slug: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const service = await resolveManagedServiceContext(slug, actor.userId, 'ADMINISTRATION').catch(
    (error: unknown) => {
      if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
        throw new ApplicationError('NOT_FOUND', 'managed service unavailable');
      throw error;
    },
  );
  if (!['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(service.serviceRole))
    throw new ApplicationError('NOT_FOUND', 'managed service unavailable');
  return { actor, service };
}

async function readJson(request: Request) {
  if (
    request.method !== 'POST' ||
    !request.body ||
    request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json'
  )
    throw new ApplicationError('VALIDATION_ERROR', 'JSON POST required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 32_768) {
        await reader.cancel();
        throw new ApplicationError('VALIDATION_ERROR', 'request too large');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON');
  }
}

export async function trainingSupportSkillAdminResponse(
  request: Request,
  slug: string,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const { actor, service } = await managedContext(slug);
    if (request.method === 'GET') {
      const data = await listTrainingSupportSkillsForAdmin({
        workspaceId: service.workspaceId,
        serviceId: service.serviceId,
      });
      return Response.json({ data }, { headers });
    }
    const parsed = command.safeParse(await readJson(request));
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid skill lifecycle request');
    const data = await executeTrainingSupportSkillAdmin({
      workspaceId: service.workspaceId,
      serviceId: service.serviceId,
      actorUserId: actor.userId,
      actorServiceRole: service.serviceRole,
      command: parsed.data,
    });
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(error, 'ai-training-skill-lifecycle-admin');
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
