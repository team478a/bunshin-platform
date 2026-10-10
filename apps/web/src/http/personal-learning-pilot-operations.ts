import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import {
  parsePilotOperation,
  parsePersonalLearningPreparationAuthority,
  parsePersonalLearningCallAdmissionPolicy,
  parseAiTokenPricingRegistry,
  reservePersonalLearningCallCost,
  type PilotOperation,
} from '@bunshin/application';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const denied = () => new ApplicationError('NOT_FOUND', 'pilot operation unavailable');
const configKeys = [
  'PERSONAL_LEARNING_PILOT_OPERATIONS',
  'PERSONAL_LEARNING_PRODUCTION_PREPARATION',
  'PERSONAL_LEARNING_PILOT',
  'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT',
  'PERSONAL_LEARNING_CALL_ADMISSION',
  'PERSONAL_LEARNING_AI_PRICING',
  'PERSONAL_LEARNING_DEFINITION_ADMIN',
  'PERSONAL_LEARNING_PROFILE_PREPARATION',
  'PERSONAL_LEARNING_PARTICIPANT_PREPARATION',
] as const;

export async function personalLearningPilotOperationsResponse(
  request: Request,
  serviceSlug: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json(
        { requestId },
        { status: 405, headers: { ...headers, allow: 'GET, POST' } },
      );
    if (request.method === 'POST') requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const environment = getServerEnvironment().APP_ENV;
    const snapshot = configKeys.map((k) => process.env[k]);
    if (
      !['production', 'staging', 'development'].includes(environment) ||
      process.env['PERSONAL_LEARNING_PILOT_OPERATIONS'] !== 'true'
    )
      throw denied();
    let raw: unknown;
    try {
      raw = JSON.parse(process.env['PERSONAL_LEARNING_PRODUCTION_PREPARATION'] ?? 'null');
    } catch {
      throw denied();
    }
    const authority = parsePersonalLearningPreparationAuthority(raw);
    if (!authority) throw denied();
    if (new URL(request.url).search)
      throw new ApplicationError('VALIDATION_ERROR', 'query not accepted');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    if (authority.workspaceId !== service.workspaceId || authority.groupId !== service.serviceId)
      throw denied();
    const guard = (action: 'READ' | PilotOperation['action']) => {
      const checkedKeys = ['STOP', 'READ'].includes(action) ? configKeys.slice(0, 2) : configKeys;
      if (
        getServerEnvironment().APP_ENV !== environment ||
        checkedKeys.some((k) => process.env[k] !== snapshot[configKeys.indexOf(k)])
      )
        throw denied();
      // The emergency stop/read path is deliberately independent of execution/preparation flags.
      if (
        !['STOP', 'READ'].includes(action) &&
        (process.env['PERSONAL_LEARNING_PILOT'] === 'true' ||
          process.env['PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'] === 'true')
      )
        throw denied();
      if (
        action === 'START' &&
        [
          'PERSONAL_LEARNING_DEFINITION_ADMIN',
          'PERSONAL_LEARNING_PROFILE_PREPARATION',
          'PERSONAL_LEARNING_PARTICIPANT_PREPARATION',
        ].some((k) => process.env[k] === 'true')
      )
        throw denied();
    };
    let command;
    let admission;
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body)
        throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 2048) {
            await reader.cancel();
            return Response.json({ requestId }, { status: 413, headers });
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      let value: unknown;
      try {
        value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new ApplicationError('VALIDATION_ERROR', 'valid JSON required');
      }
      command = parsePilotOperation(value);
      if (!command)
        throw new ApplicationError('VALIDATION_ERROR', 'valid reviewed operation required');
      guard(command.action);
      if (command.action === 'START') {
        let pricing: unknown;
        try {
          admission = parsePersonalLearningCallAdmissionPolicy(
            JSON.parse(process.env['PERSONAL_LEARNING_CALL_ADMISSION'] ?? 'null'),
          );
          pricing = JSON.parse(process.env['PERSONAL_LEARNING_AI_PRICING'] ?? 'null');
        } catch {
          throw denied();
        }
        if (!admission) throw denied();
        // Resolve existing configuration only; no HTTP/Provider execution occurs here.
        const runtime = await resolveOpenAiRuntimeConfiguration();
        let registry;
        try {
          registry = parseAiTokenPricingRegistry(pricing);
        } catch {
          throw denied();
        }
        const reservation = reservePersonalLearningCallCost({
          policy: admission,
          provider: 'openai',
          pricingRegistry: registry,
          occurredAt: new Date(),
        });
        if (
          runtime.model !== admission.model ||
          !reservation ||
          reservation.reservedCostUsdMicros > admission.dailyCostLimitUsdMicros
        )
          throw denied();
      }
    }
    const db = await import('@bunshin/database');
    guard(command?.action ?? 'READ');
    const repo = new db.PrismaPersonalLearningPilotOperations(
      db.prisma,
      authority,
      guard,
      admission,
    );
    const data = command ? await repo.change(actor.userId, command) : await repo.read(actor.userId);
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
