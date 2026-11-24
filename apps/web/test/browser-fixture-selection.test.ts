import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  job: vi.fn(),
  member: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  record: vi.fn(),
  provider: vi.fn(),
  environment: vi.fn(),
  fetcher: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: mocks.environment }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    job: { findFirst: mocks.job },
    workspaceMembership: { findFirst: mocks.member },
  },
}));
vi.mock('../src/ai/learning-provider-runtime', () => ({
  reserveLearningProviderRuntimeConfiguration: mocks.reserve,
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  settleProviderRuntimeAdmission: mocks.settle,
}));
vi.mock('../src/observability/ai-usage', () => ({ recordAiUsage: mocks.record }));

import { browserFixtureSelectionResponse } from '../src/http/browser-fixture-selection';

const jobId = '11111111-1111-4111-8111-111111111111';
const workerId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';
const admission = { id: 'fixture-admission' };
function request() {
  return new Request('http://localhost/api/internal/browser-fixture/select', {
    method: 'POST',
    headers: {
      authorization: 'Bearer fixture-secret',
      'x-browser-job-id': jobId,
      'x-browser-worker-id': workerId,
    },
  });
}
function output(id: string, usageMetadata: unknown) {
  return Response.json({
    modelVersion: 'fixture-gemini',
    candidates: [{ content: { parts: [{ text: JSON.stringify({ id }) }] } }],
    usageMetadata,
  });
}

describe('browser fixture model selection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('BROWSER_FIXTURE_MODEL_SECRET', 'fixture-secret');
    vi.stubEnv('BROWSER_FIXTURE_MODEL_WORKSPACE_ID', workspaceId);
    vi.stubEnv(
      'PERSONAL_LEARNING_AI_PRICING',
      JSON.stringify([
        {
          provider: 'google',
          model: 'fixture-gemini',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          inputPriceMicrosPerMillion: 1_000_000,
          outputPriceMicrosPerMillion: 2_000_000,
          cachedInputPriceMicrosPerMillion: 0,
          currency: 'USD',
          pricingVersion: 'fixture',
        },
      ]),
    );
    vi.stubGlobal('fetch', mocks.fetcher);
    mocks.environment.mockReturnValue({ APP_ENV: 'development' });
    mocks.job.mockResolvedValue({
      id: jobId,
      workspaceId,
      requestedBy: actorId,
      payloadReference: 'discover-model:practice-note-v1:mobile',
      leaseExpiresAt: new Date(Date.now() + 30_000),
    });
    mocks.member.mockResolvedValue({ id: 'fixture-member' });
    mocks.reserve.mockResolvedValue({
      apiKey: 'synthetic-credential',
      model: 'fixture-gemini',
      modelCapabilities: ['STRUCTURED_OUTPUT'],
      admission,
    });
    mocks.fetcher.mockImplementation(() =>
      output('compact-preview', {
        promptTokenCount: 100,
        candidatesTokenCount: 6,
        thoughtsTokenCount: 4,
        totalTokenCount: 110,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reserves one call and records tokens including thinking before settlement', async () => {
    const response = await browserFixtureSelectionResponse(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toBe('compact-preview');
    expect(mocks.reserve).toHaveBeenCalledWith(
      `browser-fixture-selection:${jobId}`,
      'google',
      'LEARNING_LESSON',
      0,
      1,
    );
    expect(mocks.job).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId,
          leaseOwner: workerId,
          status: 'LEASED',
          environment: 'DEVELOPMENT',
        }),
      }),
    );
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        actorUserId: actorId,
        outputTokens: 10,
        estimatedCostUsdMicros: 120,
        taskType: 'BROWSER_FIXTURE_SELECTION',
        status: 'SUCCESS',
      }),
    );
    expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.settle.mock.invocationCallOrder[0]!,
    );
    expect(mocks.settle).toHaveBeenCalledWith(admission);
  });

  it('skips model admission for an unauthorized or disabled worker', async () => {
    mocks.job.mockResolvedValue(null);
    expect((await browserFixtureSelectionResponse(request())).status).toBe(404);
    mocks.environment.mockReturnValue({ APP_ENV: 'production' });
    expect((await browserFixtureSelectionResponse(request())).status).toBe(404);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('preserves reservations with unknown cost and rejects an unknown candidate', async () => {
    mocks.fetcher.mockImplementation(() => output('other', {}));
    expect((await browserFixtureSelectionResponse(request())).ok).toBe(false);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCostUsdMicros: null,
        status: 'FAILED',
      }),
    );
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('does not call the model when the existing spend gate denies the operation', async () => {
    mocks.reserve.mockRejectedValue(new Error('reservation refused'));
    expect((await browserFixtureSelectionResponse(request())).ok).toBe(false);
    expect(mocks.fetcher).not.toHaveBeenCalled();
  });
});
