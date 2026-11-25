import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BrowserRunError, runBrowserPlan } from './browser';
import { saveEvidence } from './evidence';
import { fixture, fixturePlan } from './fixture';

function integer(name: string, fallback: number, max: number) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid value for ${name}`);
  }
  return value;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const cancellation = new AbortController();
  const stop = () => cancellation.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const signal = cancellation.signal;
  const limits = {
    timeoutMs: integer('BROWSER_WORKER_TIMEOUT_MS', 30_000, 2_147_453_647),
    maxSteps: integer('BROWSER_WORKER_MAX_STEPS', 20, Number.MAX_SAFE_INTEGER),
  };
  const output = resolve(process.env['BROWSER_WORKER_OUTPUT'] ?? '.e2e/browser-evidence');

  if (command === 'smoke') {
    const device = args[0] ?? 'mobile';
    if (device !== 'mobile' && device !== 'desktop') throw new BrowserRunError('INVALID_PLAN');
    const result = await runBrowserPlan(fixturePlan(device), fixture, limits, signal);
    const directory = await saveEvidence(output, randomUUID(), result, signal);
    console.log(
      JSON.stringify({
        directory,
        device,
        steps: result.steps.length,
        durationMs: result.durationMs,
        browserVersion: result.browserVersion,
      }),
    );
    return;
  }

  if (
    command !== 'enqueue' &&
    command !== 'discover' &&
    command !== 'discover-model' &&
    command !== 'discover-observed-model' &&
    command !== 'replay' &&
    command !== 'material' &&
    command !== 'cancel' &&
    command !== 'serve' &&
    command !== 'once' &&
    command !== 'schedule-training-rechecks' &&
    command !== 'rollback-training-material'
  ) {
    throw new Error(
      'Usage: smoke [mobile|desktop] | enqueue WORKSPACE_ID ACTOR_ID DEVICE REQUEST_ID | discover|discover-model|discover-observed-model WORKSPACE_ID ACTOR_ID DEVICE REQUEST_ID | replay|material WORKSPACE_ID ACTOR_ID RECIPE_ID REQUEST_ID | cancel WORKSPACE_ID ACTOR_ID JOB_ID | serve | once | schedule-training-rechecks | rollback-training-material WORKSPACE_ID ACTOR_ID OLD_MATERIAL_ID CURRENT_MATERIAL_ID',
    );
  }
  const databaseUrl = process.env['BROWSER_FIXTURE_DATABASE_URL'];
  if (!databaseUrl) throw new Error('BROWSER_FIXTURE_DATABASE_URL is required');
  process.env['DATABASE_URL'] = databaseUrl;
  const queue = await import('./queue');
  try {
    if (
      command === 'enqueue' ||
      command === 'discover' ||
      command === 'discover-model' ||
      command === 'discover-observed-model' ||
      command === 'replay' ||
      command === 'material'
    ) {
      const [workspace = '', actor = '', device = '', request = ''] = args;
      console.log(
        JSON.stringify(
          await queue.enqueueFixture(
            workspace,
            actor,
            device,
            request,
            command === 'enqueue' ? 'fixture' : command,
          ),
        ),
      );
    } else if (command === 'cancel') {
      const [workspace = '', actor = '', jobId = ''] = args;
      console.log(JSON.stringify(await queue.cancelFixture(workspace, actor, jobId)));
    } else if (command === 'schedule-training-rechecks') {
      const { scheduleTrainingReviews } = await import('./training-material');
      console.log(JSON.stringify({ queued: await scheduleTrainingReviews() }));
    } else if (command === 'rollback-training-material') {
      const [workspaceId, actorId, materialId, expectedCurrentId] = args;
      const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
      if (
        !workspaceId ||
        !actorId ||
        !materialId ||
        !expectedCurrentId ||
        ![workspaceId, actorId, materialId, expectedCurrentId].every((value) => uuid.test(value))
      )
        throw new BrowserRunError('INVALID_PLAN');
      const { rollbackTrainingMaterial } = await import('./training-material');
      console.log(
        JSON.stringify(
          await rollbackTrainingMaterial({ workspaceId, actorId, materialId, expectedCurrentId }),
        ),
      );
    } else {
      await queue.runQueue({
        output,
        once: command === 'once',
        concurrency: integer('BROWSER_WORKER_CONCURRENCY', 1, Number.MAX_SAFE_INTEGER),
        limits,
        signal,
      });
    }
  } finally {
    await queue.disconnect();
  }
}

main().catch((error: unknown) => {
  // Provider or DB errors may contain connection details.
  console.error(error instanceof BrowserRunError ? error.message : 'Browser worker command failed');
  process.exitCode = 1;
});
