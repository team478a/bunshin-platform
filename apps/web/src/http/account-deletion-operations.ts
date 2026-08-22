import 'server-only';
import {
  CompleteAccountDeletionPurge,
  PrepareNextAccountDeletion,
  RunAccountDeletionBatch,
  type AccountDeletionBatchSummary,
} from '@bunshin/application';
import { SupabaseAuthAdministrationAdapter } from '@bunshin/auth';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { randomUUID } from 'node:crypto';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();

export interface AccountDeletionBatchPort {
  dryRun(): Promise<AccountDeletionBatchSummary>;
  execute(workerId: string, batchSize?: number): Promise<AccountDeletionBatchSummary>;
}

async function configuredBatch(): Promise<AccountDeletionBatchPort> {
  const configuration = getServerEnvironment();
  const db = await import('@bunshin/database');
  const orchestration = new db.PrismaAccountDeletionOrchestrationRepository();
  if (
    !configuration.SUPABASE_AUTH_ADMIN_URL ||
    !configuration.SUPABASE_SERVICE_ROLE_KEY ||
    !configuration.SUPABASE_AUTH_ADMIN_ENV
  )
    throw new ApplicationError('CONFIGURATION_ERROR', 'Auth administration is not configured');
  return new RunAccountDeletionBatch(
    new PrepareNextAccountDeletion(new db.PrismaAccountDeletionExecutionRepository()),
    orchestration,
    new SupabaseAuthAdministrationAdapter({
      url: configuration.SUPABASE_AUTH_ADMIN_URL,
      serviceRoleKey: configuration.SUPABASE_SERVICE_ROLE_KEY,
      environment: configuration.SUPABASE_AUTH_ADMIN_ENV,
      runtimeEnvironment: configuration.APP_ENV,
    }),
    new CompleteAccountDeletionPurge(new db.PrismaAccountDeletionPurgeRepository()),
  );
}

async function dryRunBatch(): Promise<AccountDeletionBatchPort> {
  const db = await import('@bunshin/database');
  const orchestration = new db.PrismaAccountDeletionOrchestrationRepository();
  return {
    dryRun: () =>
      new RunAccountDeletionBatch(
        new PrepareNextAccountDeletion(new db.PrismaAccountDeletionExecutionRepository()),
        orchestration,
        { deleteUser: () => Promise.resolve({ success: true, alreadyAbsent: true }) },
        new CompleteAccountDeletionPurge(new db.PrismaAccountDeletionPurgeRepository()),
      ).dryRun(),
    execute: () => {
      throw new ApplicationError('FORBIDDEN', 'Dry-run cannot execute account deletion');
    },
  };
}

export async function accountDeletionOperationsResponse(
  request: Request,
  batchFactory: () => Promise<AccountDeletionBatchPort> = configuredBatch,
  dryRunFactory: () => Promise<AccountDeletionBatchPort> = dryRunBatch,
): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const configuration = getServerEnvironment();
    authorizeCronRequest(request, configuration.CRON_SECRET);
    if (configuration.ACCOUNT_DELETION_EXECUTION_MODE === 'disabled')
      return Response.json({ mode: 'disabled', requestId });
    const result =
      configuration.ACCOUNT_DELETION_EXECUTION_MODE === 'dry-run'
        ? await (await dryRunFactory()).dryRun()
        : await (await batchFactory()).execute(`account-deletion-${randomUUID()}`, 3);
    logger.info('account deletion operations batch complete', {
      requestId,
      route: '/api/internal/account-deletions/run',
      status: 200,
      latency: Date.now() - started,
      ...result,
    });
    return Response.json({ ...result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('account deletion operations batch failed', {
      requestId,
      route: '/api/internal/account-deletions/run',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
