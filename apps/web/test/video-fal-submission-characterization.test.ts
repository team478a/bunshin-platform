import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExecuteVideoAiSceneGenerationJob,
  ExecuteVideoSceneGenerationStep,
  VIDEO_AI_SCENE_GENERATION_JOB_TYPE,
  type CompleteJob,
  type FailJob,
  type Job,
  type VideoSceneGenerationRecord,
  type VideoSceneGenerationRepository,
} from '@bunshin/application';
import { FalKlingVideoAdapter } from '../src/providers/fal-kling-video';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const generationId = '22222222-2222-4222-8222-222222222222';
const model = 'fal-ai/kling-video/o1/reference-to-video';
const inputSnapshot = { scene: { visualPrompt: '架空の製品を映す', durationMs: 5_000 } };
const referenceStorageKeys = ['workspace/character-reference.png'];

type SaveMode = 'normal' | 'throw-before-write' | 'throw-after-write' | 'conflict';
type Store = {
  generation: VideoSceneGenerationRecord;
  saveMode: SaveMode;
  claimConflict: boolean;
  claimCalls: number;
  markSubmittedCalls: number;
  markSucceededCalls: number;
  storageCalls: number;
  failStorage: boolean;
  beforeSave: (() => Promise<void>) | undefined;
};

const newStore = (): Store => ({
  generation: {
    id: generationId,
    workspaceId,
    groupId: '33333333-3333-4333-8333-333333333333',
    groupMembershipId: '44444444-4444-4444-8444-444444444444',
    ownerUserId: '55555555-5555-4555-8555-555555555555',
    videoProjectId: '66666666-6666-4666-8666-666666666666',
    videoSceneId: '77777777-7777-4777-8777-777777777777',
    projectRevision: 3,
    sceneRevision: 2,
    provider: 'FAL',
    model,
    status: 'QUEUED',
    inputSnapshot,
    estimatedCostUsdMicros: 300_000,
    actualCostUsdMicros: null,
    externalJobId: null,
    outputStorageKey: null,
    errorCode: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-09-30T00:00:00Z'),
    updatedAt: new Date('2026-09-30T00:00:00Z'),
  },
  saveMode: 'normal',
  claimConflict: false,
  claimCalls: 0,
  markSubmittedCalls: 0,
  markSucceededCalls: 0,
  storageCalls: 0,
  failStorage: false,
  beforeSave: undefined,
});

const persistedRepository = (store: Store): VideoSceneGenerationRepository => ({
  enqueueAiScenes: () => Promise.resolve(null),
  findForExecution: ({ workspaceId: requestedWorkspace, generationId: requestedId }) =>
    Promise.resolve(
      requestedWorkspace === workspaceId && requestedId === generationId
        ? {
            generation: { ...store.generation },
            prompt: '架空の製品を映す',
            durationSeconds: 5,
            referenceStorageKeys: [...referenceStorageKeys],
          }
        : null,
    ),
  claimFalSubmission: () => {
    store.claimCalls += 1;
    if (store.claimConflict || store.generation.status !== 'QUEUED') return Promise.resolve(null);
    store.generation = {
      ...store.generation,
      status: 'SUBMISSION_UNKNOWN',
      errorCode: 'FAL_SUBMISSION_UNCONFIRMED',
    };
    return Promise.resolve({ ...store.generation });
  },
  markSubmitted: async ({ externalJobId }) => {
    store.markSubmittedCalls += 1;
    await store.beforeSave?.();
    if (store.saveMode === 'throw-before-write') throw new Error('simulated DB write failure');
    if (store.saveMode === 'conflict' || store.generation.status !== 'SUBMISSION_UNKNOWN')
      return null;
    store.generation = { ...store.generation, status: 'SUBMITTED', externalJobId, errorCode: null };
    if (store.saveMode === 'throw-after-write')
      throw new Error('simulated lost DB acknowledgement');
    return { ...store.generation };
  },
  markGenerating: () => {
    store.generation = { ...store.generation, status: 'GENERATING' };
    return Promise.resolve({ ...store.generation });
  },
  markSucceeded: ({ outputStorageKey }) => {
    store.markSucceededCalls += 1;
    store.generation = { ...store.generation, status: 'SUCCEEDED', outputStorageKey };
    return Promise.resolve({ ...store.generation });
  },
  markFailed: ({ errorCode }) => {
    store.generation = { ...store.generation, status: 'FAILED', errorCode };
    return Promise.resolve({ ...store.generation });
  },
});

/** Deliberately treats each accepted POST as a distinct fake order; this is NOT a fal guarantee. */
class FakeFalQueue {
  postAttempts = 0;
  getAttempts = 0;
  acceptedOrders: Array<{ id: string; body: unknown }> = [];
  failBeforeAcceptance = false;
  loseResponseAfterAcceptance = false;
  failInspection = false;
  onPost: (() => void) | undefined;

  request: typeof fetch = async (input, init) => {
    await Promise.resolve();
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.hostname !== 'queue.fal.run' || !url.pathname.startsWith(`/${model}`))
      throw new Error(`unmocked external request: ${url.origin}`);
    if (init?.method === 'POST') {
      this.onPost?.();
      this.postAttempts += 1;
      if (this.failBeforeAcceptance) {
        this.failBeforeAcceptance = false;
        throw new Error('simulated pre-accept disconnect');
      }
      const id = `fake_request_${this.acceptedOrders.length + 1}`;
      this.acceptedOrders.push({ id, body: JSON.parse(init.body as string) as unknown });
      if (this.loseResponseAfterAcceptance) {
        this.loseResponseAfterAcceptance = false;
        throw new Error('simulated lost submit response');
      }
      return Response.json({ request_id: id });
    }
    if (init?.method === 'GET') {
      this.getAttempts += 1;
      if (this.failInspection) {
        this.failInspection = false;
        throw new Error('simulated status timeout');
      }
      const id = /\/requests\/(fake_request_\d+)/.exec(url.pathname)?.[1];
      if (!id || !this.acceptedOrders.some((order) => order.id === id))
        throw new Error('unknown fake request');
      if (url.pathname.endsWith('/status'))
        return Response.json({
          status: 'COMPLETED',
          response_url: `https://queue.fal.run/${model}/requests/${id}`,
        });
      return Response.json({ video: { url: 'https://fal.media/fake-output.mp4' } });
    }
    throw new Error('unexpected fake request method');
  };
}

const runStep = (store: Store, queue: FakeFalQueue) =>
  new ExecuteVideoSceneGenerationStep(
    persistedRepository(store), // new repository/use-case/adapter instance for each run
    new FalKlingVideoAdapter('dummy-test-key', queue.request),
    {
      createTemporaryReadUrls: () =>
        Promise.resolve(['https://example.invalid/fake-reference.png']),
    },
    {
      store: () => {
        store.storageCalls += 1;
        if (store.failStorage) throw new Error('simulated private storage failure');
        return Promise.resolve({ storageKey: 'workspace/private/fake-output.mp4' });
      },
    },
  ).execute({ workspaceId, generationId });

describe('fal/Kling submission characterization (fake provider, no external network)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('unmocked external communication is forbidden');
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('F0 characterization: submits, persists the ID, inspects and stores success', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    queue.onPost = () => {
      expect(store.generation).toMatchObject({
        status: 'SUBMISSION_UNKNOWN',
        externalJobId: null,
      });
    };
    await expect(runStep(store, queue)).resolves.toMatchObject({ status: 'PENDING' });
    await expect(runStep(store, queue)).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect({
      posts: queue.postAttempts,
      orders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
    }).toEqual({ posts: 1, orders: 1, gets: 2 });
    expect(store.generation).toMatchObject({
      status: 'SUCCEEDED',
      externalJobId: 'fake_request_1',
      outputStorageKey: 'workspace/private/fake-output.mp4',
      actualCostUsdMicros: null,
    });
    expect(store.markSucceededCalls).toBe(1);
    expect(store.claimCalls).toBe(1);
  });

  it('F1 safety regression: even a fake pre-accept failure stays on hold because the client cannot know', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    queue.failBeforeAcceptance = true;
    await expect(runStep(store, queue)).rejects.toMatchObject({ category: 'TIMEOUT_OR_NETWORK' });
    expect(store.generation).toMatchObject({ status: 'SUBMISSION_UNKNOWN', externalJobId: null });
    await expect(runStep(store, queue)).resolves.toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
    });
    expect({
      posts: queue.postAttempts,
      orders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
    }).toEqual({ posts: 1, orders: 0, gets: 0 });
  });

  it('F2 safety regression: response loss after fake acceptance is held without a second POST', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    queue.loseResponseAfterAcceptance = true;
    await expect(runStep(store, queue)).rejects.toMatchObject({ category: 'TIMEOUT_OR_NETWORK' });
    expect(store.generation).toMatchObject({
      status: 'SUBMISSION_UNKNOWN',
      externalJobId: null,
      actualCostUsdMicros: null,
    });
    await expect(runStep(store, queue)).resolves.toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
    });
    expect({
      posts: queue.postAttempts,
      fakeOrders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
    }).toEqual({ posts: 1, fakeOrders: 1, gets: 0 });
    expect(store.generation.externalJobId).toBeNull();
    expect(store.generation.inputSnapshot).toEqual(inputSnapshot);
    expect(store.generation.model).toBe(model);
  });

  it('F2 Job safety regression: next delivery ends non-retryably for reconciliation without re-POST', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    queue.loseResponseAfterAcceptance = true;
    const job = {
      id: '88888888-8888-4888-8888-888888888888',
      workspaceId,
      bunshinId: null,
      capabilityType: null,
      correlationId: 'fake-correlation',
      requestedBy: 'characterization-test',
      environment: 'DEVELOPMENT',
      jobType: VIDEO_AI_SCENE_GENERATION_JOB_TYPE,
      idempotencyKey: `video-ai-scene:${generationId}`,
      payloadReference: `video-ai-scene:${generationId}`,
      priority: 0,
      maxAttempts: 3,
      status: 'LEASED',
      scheduledAt: new Date('2026-09-30T00:00:00Z'),
      attemptCount: 1,
      leaseOwner: 'worker-1',
      leaseExpiresAt: null,
      nextRetryAt: null,
      lastErrorCategory: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: new Date('2026-09-30T00:00:00Z'),
      updatedAt: new Date('2026-09-30T00:00:00Z'),
    } satisfies Job;
    const failCalls: Array<{ errorCategory: string; retryable: boolean }> = [];
    const fail = {
      execute: (
        _job: Job,
        _workerId: string,
        failure: { errorCategory: string; retryable: boolean },
      ) => {
        failCalls.push(failure);
        return Promise.resolve({
          ...job,
          status: failure.retryable ? 'RETRY_SCHEDULED' : 'DEAD',
          attemptCount: failCalls.length,
        });
      },
    } as unknown as FailJob;
    const completeExecute = vi.fn().mockResolvedValue({ ...job, status: 'SUCCEEDED' });
    const complete = { execute: completeExecute } as unknown as CompleteJob;
    const handler = {
      execute: async () => {
        const result = await runStep(store, queue);
        return {
          status:
            result.status === 'RECONCILIATION_REQUIRED'
              ? ('RECONCILIATION_REQUIRED' as const)
              : result.status === 'PENDING'
                ? ('SUBMITTED' as const)
                : ('SUCCEEDED' as const),
        };
      },
      markFailed: () => Promise.resolve(),
    };
    await expect(
      new ExecuteVideoAiSceneGenerationJob(handler, complete, fail).execute(job, 'worker-1'),
    ).resolves.toMatchObject({ status: 'RETRY_SCHEDULED' });
    expect(store.generation).toMatchObject({ status: 'SUBMISSION_UNKNOWN', externalJobId: null });
    expect(failCalls).toEqual([{ errorCategory: 'VIDEO_AI_SCENE_UNEXPECTED', retryable: true }]);
    await expect(
      new ExecuteVideoAiSceneGenerationJob(handler, complete, fail).execute(
        { ...job, attemptCount: 2 },
        'worker-2',
      ),
    ).resolves.toMatchObject({ status: 'DEAD' });
    expect(failCalls).toEqual([
      { errorCategory: 'VIDEO_AI_SCENE_UNEXPECTED', retryable: true },
      { errorCategory: 'VIDEO_AI_SCENE_RECONCILIATION_REQUIRED', retryable: false },
    ]);
    expect(completeExecute).not.toHaveBeenCalled();
    expect({
      posts: queue.postAttempts,
      fakeOrders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
    }).toEqual({ posts: 1, fakeOrders: 1, gets: 0 });
  });

  it('F3 safety regression: lost ID write stays on hold without a second POST', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    store.saveMode = 'throw-before-write';
    await expect(runStep(store, queue)).rejects.toThrow('simulated DB write failure');
    expect(store.generation).toMatchObject({ status: 'SUBMISSION_UNKNOWN', externalJobId: null });
    store.saveMode = 'normal';
    await expect(runStep(store, queue)).resolves.toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
    });
    expect({
      posts: queue.postAttempts,
      fakeOrders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
      saves: store.markSubmittedCalls,
    }).toEqual({ posts: 1, fakeOrders: 1, gets: 0, saves: 1 });
    expect(store.generation.externalJobId).toBeNull();
  });

  it('F4 characterization: persisted ID with lost acknowledgement resumes by inspection, not POST', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    store.saveMode = 'throw-after-write';
    await expect(runStep(store, queue)).rejects.toThrow('simulated lost DB acknowledgement');
    expect(store.generation).toMatchObject({
      status: 'SUBMITTED',
      externalJobId: 'fake_request_1',
    });
    store.saveMode = 'normal';
    await expect(runStep(store, queue)).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect({
      posts: queue.postAttempts,
      fakeOrders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
    }).toEqual({ posts: 1, fakeOrders: 1, gets: 2 });
  });

  it('F5 safety regression: markSubmitted conflict without a winner remains on hold', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    store.saveMode = 'conflict';
    await expect(runStep(store, queue)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(store.generation).toMatchObject({ status: 'SUBMISSION_UNKNOWN', externalJobId: null });
    expect({
      posts: queue.postAttempts,
      fakeOrders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
    }).toEqual({ posts: 1, fakeOrders: 1, gets: 0 });
    store.saveMode = 'normal';
    await expect(runStep(store, queue)).resolves.toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
    });
    expect(queue.postAttempts).toBe(1);
  });

  it('F5 safety regression: losing the pre-POST claim never contacts fal', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    store.claimConflict = true;
    await expect(runStep(store, queue)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(store.claimCalls).toBe(1);
    expect(store.generation).toMatchObject({ status: 'QUEUED', externalJobId: null });
    expect(queue.postAttempts).toBe(0);
  });

  it('F5 characterization: deterministic competing save makes later run inspect the winner', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    let releaseSave: (() => void) | undefined;
    let saveEntered: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      saveEntered = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    store.beforeSave = async () => {
      saveEntered?.();
      await release;
    };
    const first = runStep(store, queue);
    await entered;
    store.generation = {
      ...store.generation,
      status: 'SUBMITTED',
      externalJobId: 'fake_request_1',
    };
    releaseSave?.();
    await expect(first).rejects.toMatchObject({ code: 'CONFLICT' });
    store.beforeSave = undefined;
    await expect(runStep(store, queue)).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect({
      posts: queue.postAttempts,
      fakeOrders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
    }).toEqual({ posts: 1, fakeOrders: 1, gets: 2 });
  });

  it('F6 characterization: status timeout and output storage failure reuse the saved ID', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    await runStep(store, queue);
    queue.failInspection = true;
    await expect(runStep(store, queue)).rejects.toMatchObject({ category: 'TIMEOUT_OR_NETWORK' });
    store.failStorage = true;
    await expect(runStep(store, queue)).rejects.toThrow('simulated private storage failure');
    store.failStorage = false;
    await expect(runStep(store, queue)).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect({
      posts: queue.postAttempts,
      fakeOrders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
      storageAttempts: store.storageCalls,
    }).toEqual({ posts: 1, fakeOrders: 1, gets: 5, storageAttempts: 2 });
    expect(store.generation).toMatchObject({
      status: 'SUCCEEDED',
      externalJobId: 'fake_request_1',
      actualCostUsdMicros: null,
    });
  });

  it('F7 characterization: a completed generation short-circuits duplicate execution', async () => {
    const store = newStore();
    const queue = new FakeFalQueue();
    await runStep(store, queue);
    await runStep(store, queue);
    await expect(runStep(store, queue)).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect({
      posts: queue.postAttempts,
      fakeOrders: queue.acceptedOrders.length,
      gets: queue.getAttempts,
      storageAttempts: store.storageCalls,
    }).toEqual({ posts: 1, fakeOrders: 1, gets: 2, storageAttempts: 1 });
  });
});
