import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InternalPreparationCard } from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/internal-card';
import {
  internalCommand,
  internalSnapshot,
  internalStep,
  submitInternal,
  type InternalSnapshot,
} from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/internal-client';
const member = '11111111-1111-4111-8111-111111111111';
const offering = '22222222-2222-4222-8222-222222222222';
const enrollment = '33333333-3333-4333-8333-333333333333';
const initial: InternalSnapshot = {
  operation: { exists: true, status: 'SUSPENDED', enabled: false, stateToken: 'a'.repeat(64) },
  policy: null,
  groupMembershipId: member,
  programOfferingId: offering,
  programEnrollmentId: null,
  enrollmentReady: false,
  seatStatus: 'ABSENT',
};
const configured: InternalSnapshot = {
  ...initial,
  policy: {
    version: 'PILOT_PARTICIPANT_CAP_V1',
    revision: 1,
    externalParticipantCap: 100,
    internalParticipantCap: 1,
    currentWave: 0,
    currentWaveCap: 0,
  },
};
const prepared: InternalSnapshot = {
  ...configured,
  programEnrollmentId: enrollment,
  enrollmentReady: true,
};
afterEach(() => vi.unstubAllGlobals());
describe('stopped own INTERNAL preparation', () => {
  it('renders no automatic request/mutation and no preselected cap or confirmation', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const html = renderToStaticMarkup(<InternalPreparationCard serviceSlug="test" />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(html).toContain('本人の準備状態を確認');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('href=');
  });
  it('requires explicit cap, bounded human review and confirmation', () => {
    expect(internalCommand(initial, 'review', true, '')).toBeNull();
    expect(internalCommand(initial, 'review', true, '3')).toBeNull();
    expect(internalCommand(initial, 'review', false, '1')).toBeNull();
    expect(internalCommand(initial, 'private text', true, '1')).toBeNull();
    expect(internalCommand(initial, 'review', true, '2')).toMatchObject({
      action: 'CONFIGURE',
      expectedRevision: 0,
      internalParticipantCap: 2,
      externalParticipantCap: 100,
      currentWave: 0,
    });
  });
  it('reuses own refs and latest tokens; no authority/user/profile/settings payload', () => {
    const command = internalCommand(configured, 'review', true, '');
    expect(command).toMatchObject({
      action: 'PREPARE_ENROLLMENT',
      groupMembershipId: member,
      programOfferingId: offering,
      expectedStateToken: initial.operation.stateToken,
    });
    expect(Object.keys(command!)).toHaveLength(7);
    expect(internalCommand(prepared, 'review', true, '')).toMatchObject({
      action: 'ADMIT',
      programEnrollmentId: enrollment,
      kind: 'INTERNAL',
      expectedRevision: 1,
    });
  });
  it('stages CONFIGURE -> PREPARE -> ADMIT -> DONE without overwriting existing policy', () => {
    expect(internalStep(initial)).toBe('CONFIGURE');
    expect(internalStep(configured)).toBe('PREPARE_ENROLLMENT');
    expect(internalStep(prepared)).toBe('ADMIT');
    expect(internalStep({ ...prepared, seatStatus: 'INTERNAL' })).toBe('DONE');
    expect(
      internalCommand({ ...prepared, seatStatus: 'INTERNAL' }, 'review', true, '2'),
    ).toBeNull();
  });
  it('fails closed for active/absent Program, wave expansion, revoked/foreign seat, invalid enrollment/offering', () => {
    for (const s of [
      null,
      { ...initial, operation: { ...initial.operation, enabled: true } },
      { ...initial, operation: { ...initial.operation, status: 'ACTIVE' } },
      { ...initial, operation: { ...initial.operation, exists: false } },
      { ...configured, policy: { ...configured.policy!, currentWave: 1, currentWaveCap: 5 } },
      { ...configured, policy: { ...configured.policy!, internalParticipantCap: 5 } },
      { ...configured, programOfferingId: null },
      { ...prepared, enrollmentReady: false },
      { ...prepared, seatStatus: 'REVOKED' as const },
      { ...prepared, seatStatus: 'OTHER' as const },
      { ...prepared, policy: null },
    ]) {
      expect(internalStep(s)).toBe('BLOCKED');
      expect(internalCommand(s, 'review', true, '1')).toBeNull();
    }
  });
  it('validates unknown read receipts and policy versions', () => {
    expect(internalSnapshot(initial)).toEqual(initial);
    for (const s of [
      {},
      { ...initial, groupMembershipId: 'bad' },
      { ...initial, seatStatus: 'UNKNOWN' },
      { ...initial, policy: {} },
      { ...prepared, programEnrollmentId: 'bad' },
      { ...initial, operation: { ...initial.operation, stateToken: 'bad' } },
    ])
      expect(internalSnapshot(s)).toBeNull();
  });
  it('lost response replays exactly the same command; never advances automatically', async () => {
    const command = internalCommand(initial, 'review', true, '1')!;
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(
        Response.json({ data: { revision: 1, reason: 'PILOT_WAVE_CONFIGURED' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await submitInternal('test', command)).toBe('RETRY');
    expect(await submitInternal('test', command)).toBe('SAVED');
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
    expect(fetcher.mock.calls[0]![0]).toBe('/api/services/test/ai-training/pilot-participants');
  });
  it('prepares with existing API and requires a stopped Enrollment receipt', async () => {
    const command = internalCommand(configured, 'review', true, '')!;
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          ...initial.operation,
          programEnrollmentId: enrollment,
        },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(await submitInternal('test', command)).toBe('SAVED');
    expect(fetcher.mock.calls[0]![0]).toContain('pilot-operations');
    fetcher.mockResolvedValue(
      Response.json({
        data: { ...initial.operation, enabled: true, programEnrollmentId: enrollment },
      }),
    );
    expect(await submitInternal('test', command)).toBe('RETRY');
  });
  it.each([401, 403, 404, 409, 413])(
    'rejects HTTP %s with no raw error display',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret', { status })));
      expect(await submitInternal('test', internalCommand(prepared, 'review', true, '')!)).toBe(
        'REJECTED',
      );
    },
  );
  it('rejects START before HTTP and treats malformed/wrong revision receipts as unknown', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(
      await submitInternal('test', {
        action: 'START',
        operationId: member,
        expectedStateToken: 'a'.repeat(64),
        confirmation: 'CONFIRM_PILOT_OPERATION',
        reviewEvidenceKey: 'review',
      }),
    ).toBe('REJECTED');
    expect(fetcher).not.toHaveBeenCalled();
    for (const data of [
      {},
      { revision: 99, reason: 'PARTICIPANT_ADMITTED' },
      { revision: 2, reason: 'PARTICIPANT_REVOKED' },
    ]) {
      fetcher.mockResolvedValue(Response.json({ data }));
      expect(await submitInternal('test', internalCommand(prepared, 'review', true, '')!)).toBe(
        'RETRY',
      );
    }
  });
});
