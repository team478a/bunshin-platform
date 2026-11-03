import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Application from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({
  actor: vi.fn(),
  origin: vi.fn(),
  service: vi.fn(),
  schedule: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: f.service }));
vi.mock('../src/line/secure-configuration', () => ({ currentLineEnvironment: () => 'STAGING' }));
vi.mock('@bunshin/application', async (importOriginal) => ({
  ...(await importOriginal<typeof Application>()),
  EnqueueJob: class {
    enqueue = f.enqueue;
  },
}));
vi.mock('@bunshin/database', () => ({
  PrismaServiceLineBroadcastAudienceRepository: class {
    schedule = f.schedule;
  },
  PrismaJobRepository: class {},
}));
import { sendServiceLineBroadcastResponse } from '../src/http/service-line-broadcasts';
const id = '11111111-1111-4111-8111-111111111111';
const command = {
  operationId: id,
  title: '案内',
  message: '案内の本文',
  reason: '公式のお知らせ',
  confirmed: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
  expectedRecipientCount: 2,
  segment: { industryIds: [], purposes: [] },
};
const request = (body: unknown = command) =>
  new Request('https://example.test/api/services/social-a/line-broadcasts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://example.test' },
    body: JSON.stringify(body),
  });
const at = new Date('2026-11-03T00:00:00Z');
describe('broadcast confirmation HTTP', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.actor.mockResolvedValue({ userId: 'manager' });
    f.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service' });
    f.schedule.mockResolvedValue({
      kind: 'SCHEDULED',
      broadcastId: id,
      scheduledAt: at,
      recipientCount: 2,
      replayed: false,
      status: 'SCHEDULED',
    });
    f.enqueue.mockResolvedValue({ id: 'job' });
  });
  it('binds scope and immediate mode to the server; the atomic repository owns the new Job', async () => {
    const response = await sendServiceLineBroadcastResponse(
      request({ ...command, workspaceId: 'forged', actorUserId: 'forged' }),
      'social-a',
    );
    expect(response.status).toBe(200);
    expect(f.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: id,
        immediate: true,
        workspaceId: 'workspace',
        groupId: 'service',
        actorUserId: 'manager',
      }),
    );
    expect(f.enqueue).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      data: {
        broadcastId: id,
        scheduledAt: at.toISOString(),
        requested: 2,
        status: 'SCHEDULED',
        replayed: false,
      },
    });
  });
  it('keeps legacy callers and distinguishes specified schedules', async () => {
    const { operationId, ...legacy } = command;
    expect(operationId).toBe(id);
    expect(
      (await sendServiceLineBroadcastResponse(request({ ...legacy, confirmed: true }), 'social-a'))
        .status,
    ).toBe(200);
    expect(f.schedule.mock.calls[0]?.[0]).not.toHaveProperty('operationId');
    expect(f.schedule.mock.calls[0]?.[0]).not.toHaveProperty('immediate');
    expect(f.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `service-line-broadcast:${id}:attempt:1`,
        scheduledAt: at,
      }),
    );
    f.schedule.mockClear();
    expect(
      (
        await sendServiceLineBroadcastResponse(
          request({ ...command, scheduledAt: '2030-01-01T00:00:00.000Z' }),
          'social-a',
        )
      ).status,
    ).toBe(200);
    expect(f.schedule.mock.calls[0]?.[0]).not.toHaveProperty('immediate');
    expect(f.schedule.mock.calls[0]?.[0]).toMatchObject({
      scheduledAt: new Date('2030-01-01T00:00:00.000Z'),
    });
  });
  it.each(['CANCELLED', 'COMPLETED'])('does not enqueue a replay already %s', async (status) => {
    f.schedule.mockResolvedValue({
      kind: 'SCHEDULED',
      broadcastId: id,
      scheduledAt: at,
      recipientCount: 2,
      replayed: true,
      status,
    });
    const response = await sendServiceLineBroadcastResponse(request(), 'social-a');
    expect(response.status).toBe(200);
    expect(f.enqueue).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ data: { replayed: true, status } });
  });
  it('propagates an atomic scheduling refusal and does not run a separate HTTP enqueue', async () => {
    f.schedule.mockRejectedValue(new ApplicationError('NOT_FOUND', 'job scope not found'));
    expect((await sendServiceLineBroadcastResponse(request(), 'social-a')).status).toBe(404);
    expect(f.enqueue).not.toHaveBeenCalled();
    f.schedule.mockResolvedValue({
      kind: 'SCHEDULED',
      broadcastId: id,
      scheduledAt: at,
      recipientCount: 2,
      replayed: false,
      status: 'SCHEDULED',
    });
    expect((await sendServiceLineBroadcastResponse(request(), 'social-a')).status).toBe(200);
    expect(f.schedule.mock.calls[0]?.[0]).toMatchObject({ operationId: id });
    expect(f.schedule.mock.calls[1]?.[0]).toMatchObject({ operationId: id });
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it('refuses invalid IDs, unconfirmed/invalid schedules and changed counts before queueing', async () => {
    for (const body of [
      { ...command, operationId: 'bad' },
      { ...command, operationId: undefined },
      { ...command, confirmed: true },
      { ...command, confirmed: false },
      { ...command, scheduledAt: '2030-01-01T10:30' },
      { ...command, expectedRecipientCount: 501 },
    ])
      expect((await sendServiceLineBroadcastResponse(request(body), 'social-a')).status).toBe(400);
    expect(f.schedule).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
    f.schedule.mockResolvedValue({ kind: 'RECIPIENT_COUNT_CHANGED' });
    expect((await sendServiceLineBroadcastResponse(request(), 'social-a')).status).toBe(409);
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it('keeps same-origin, session and service permission checks', async () => {
    f.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin');
    });
    expect((await sendServiceLineBroadcastResponse(request(), 'social-a')).status).toBe(403);
    f.origin.mockReset();
    f.actor.mockResolvedValue(null);
    expect((await sendServiceLineBroadcastResponse(request(), 'social-a')).status).toBe(401);
    f.actor.mockResolvedValue({ userId: 'manager' });
    f.service.mockRejectedValue(new ApplicationError('NOT_FOUND', 'foreign service'));
    expect((await sendServiceLineBroadcastResponse(request(), 'other')).status).toBe(404);
    expect(f.schedule).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  });
});
