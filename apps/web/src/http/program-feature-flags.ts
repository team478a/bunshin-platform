import 'server-only';
import { personalLearningFeatures, personalLearningMode } from '@bunshin/capability-training';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const featureSchema = z
  .object({
    conversation: z.boolean(),
    multiTopic: z.boolean(),
    lineLearning: z.boolean(),
    extendedScope: z.boolean(),
    learningNudges: z.boolean(),
  })
  .strict();
const inputSchema = z
  .object({
    serviceProgramId: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime(),
    learningMode: z.enum(['DYNAMIC_V1', 'FIXED_DEFINITIONS_V1']),
    learningFeatures: featureSchema,
    reviewEvidenceKey: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/),
    confirmation: z.literal('CONFIRM_PROGRAM_FEATURE_SETTINGS'),
  })
  .strict();

const response = (data: unknown, requestId: string, status = 200) =>
  Response.json({ data, requestId }, { status, headers: { 'cache-control': 'private, no-store' } });
const failure = (error: unknown, requestId: string) => {
  const mapped = toApiError(error, requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isAiTrainingProgram = (settings: unknown) =>
  isObject(settings) && settings['moduleKey'] === 'AI_TRAINING_V1';
const currentPilot = (settings: unknown) =>
  isObject(settings) && isObject(settings['personalLearningPilot'])
    ? settings['personalLearningPilot']
    : {};
const readFlags = (settings: unknown) => ({
  learningMode: personalLearningMode(settings),
  learningFeatures: personalLearningFeatures(settings),
});
const stateToken = (updatedAt: Date) => updatedAt.toISOString();
const parseJsonBody = async (request: Request) => {
  if (!request.body) throw new ApplicationError('VALIDATION_ERROR', 'request body required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) {
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
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON');
    throw error;
  }
};

/** Read/write program-scoped learning flags for AI-training Programs owned by this service. */
export async function programFeatureFlagsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json(
        { requestId },
        { status: 405, headers: { 'cache-control': 'private, no-store', allow: 'GET, POST' } },
      );
    if (request.method === 'POST') requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');

    if (request.method === 'GET') {
      if (new URL(request.url).search)
        throw new ApplicationError('VALIDATION_ERROR', 'query not accepted');
      const programs = await db.prisma.serviceProgram.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        },
        select: { id: true, displayName: true, status: true, settings: true, updatedAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      return response(
        programs.map((program) => {
          const flags = readFlags(program.settings);
          return {
            id: program.id,
            name: program.displayName,
            status: program.status,
            updatedAt: stateToken(program.updatedAt),
            learningMode: flags.learningMode,
            learningFeatures: flags.learningFeatures,
            enabled: currentPilot(program.settings)['enabled'] === true,
            configurationValid: flags.learningMode !== null && flags.learningFeatures !== null,
          };
        }),
        requestId,
      );
    }

    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const parsed = inputSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Program feature settings');
    const input = parsed.data;

    const program = await db.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM service_programs
          WHERE id=${input.serviceProgramId}::uuid
            AND workspace_id=${service.workspaceId}::uuid
            AND group_id=${service.serviceId}::uuid
          FOR UPDATE`;
        if (locked.length !== 1) throw new ApplicationError('NOT_FOUND', 'Program unavailable');
        const current = await tx.serviceProgram.findFirst({
          where: {
            id: input.serviceProgramId,
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
          },
        });
        if (
          !current ||
          !isAiTrainingProgram(current.settings) ||
          current.updatedAt.toISOString() !== input.expectedUpdatedAt
        )
          throw new ApplicationError('CONFLICT', 'Program changed; refresh before saving');
        if (current.status === 'ACTIVE' || currentPilot(current.settings)['enabled'] === true)
          throw new ApplicationError('CONFLICT', 'suspend this Program before changing flags');
        const before = readFlags(current.settings);
        if (before.learningMode === null || before.learningFeatures === null)
          throw new ApplicationError('CONFIGURATION_ERROR', 'Program feature settings invalid');

        const currentSettings = current.settings as Record<string, unknown>;
        const pilot = currentPilot(current.settings);
        const nextSettings = {
          ...currentSettings,
          personalLearningPilot: {
            ...pilot,
            learningMode: input.learningMode,
            learningFeatures: input.learningFeatures,
          },
        };
        const updated = await tx.serviceProgram.update({
          where: { id: current.id },
          data: { settings: nextSettings },
        });
        await tx.programAuditLog.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            resourceType: 'SERVICE_PROGRAM',
            resourceId: current.id,
            action: 'LEARNING_FEATURES_UPDATED',
            beforeData: before,
            afterData: {
              learningMode: input.learningMode,
              learningFeatures: input.learningFeatures,
              reviewEvidenceKey: input.reviewEvidenceKey,
            },
            performedByUserId: actor.userId,
          },
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
    const flags = readFlags(program.settings);
    if (flags.learningMode === null || flags.learningFeatures === null)
      throw new ApplicationError('INTERNAL_ERROR', 'updated settings unavailable');
    const token = stateToken(program.updatedAt);
    return response(
      {
        id: program.id,
        name: program.displayName,
        status: program.status,
        updatedAt: token,
        learningMode: flags.learningMode,
        learningFeatures: flags.learningFeatures,
        enabled: currentPilot(program.settings)['enabled'] === true,
        configurationValid: true,
      },
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}
