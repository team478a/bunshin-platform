import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PilotOperationsCard } from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/pilot-operations-card';
import {
  availablePilotOperation,
  createPilotOperationCommand,
  pilotOperationErrorMessage,
  pilotOperationsSnapshot,
  submitPilotOperation,
  type PilotOperationsSnapshot,
} from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/pilot-operations-client';

const snapshot: PilotOperationsSnapshot = {
  exists: true,
  status: 'SUSPENDED',
  initialized: true,
  enabled: false,
  started: false,
  stateToken: 'a'.repeat(64),
  learningMode: 'FIXED_DEFINITIONS_V1',
  learningFeatures: {
    conversation: false,
    multiTopic: false,
    lineLearning: false,
    extendedScope: false,
    learningNudges: false,
  },
  openCallCount: 0,
};
const evidence = 'review-2026-10-16';
const confirmation = 'CONFIRM_PILOT_OPERATION';

afterEach(() => vi.unstubAllGlobals());

describe('Wave 0 operations UI boundaries', () => {
  it('selects only the operation allowed by the persisted state', () => {
    expect(availablePilotOperation(null)).toBeNull();
    expect(availablePilotOperation({ ...snapshot, exists: false })).toBeNull();
    expect(availablePilotOperation({ ...snapshot, initialized: false })).toBe('INITIALIZE');
    expect(availablePilotOperation(snapshot)).toBe('START');
    expect(
      availablePilotOperation({ ...snapshot, started: true, status: 'ACTIVE', enabled: true }),
    ).toBe('STOP');
    expect(availablePilotOperation({ ...snapshot, started: true, status: 'SUSPENDED' })).toBe(
      'STOP',
    );
    expect(availablePilotOperation({ ...snapshot, status: 'ACTIVE', enabled: true })).toBeNull();
  });

  it('does not create a command before explicit confirmation and bounded evidence', () => {
    expect(createPilotOperationCommand(snapshot, 'START', evidence, false)).toBeNull();
    expect(createPilotOperationCommand(snapshot, 'START', 'private body', true)).toBeNull();
    expect(createPilotOperationCommand(snapshot, 'STOP', evidence, true)).toBeNull();
    expect(
      createPilotOperationCommand({ ...snapshot, started: true }, 'STOP', evidence, true),
    ).toMatchObject({
      action: 'STOP',
      confirmation,
      reviewEvidenceKey: evidence,
      expectedStateToken: snapshot.stateToken,
    });
  });

  it('only permits audited learning configuration while suspended and disabled', () => {
    expect(
      createPilotOperationCommand(snapshot, 'SET_LEARNING_MODE', evidence, false, 'DYNAMIC_V1'),
    ).toBeNull();
    expect(
      createPilotOperationCommand(snapshot, 'SET_LEARNING_MODE', evidence, true, 'DYNAMIC_V1'),
    ).toMatchObject({ action: 'SET_LEARNING_MODE', learningMode: 'DYNAMIC_V1' });
    expect(
      createPilotOperationCommand(
        { ...snapshot, status: 'ACTIVE', enabled: true },
        'SET_LEARNING_FEATURES',
        evidence,
        true,
        snapshot.learningFeatures,
      ),
    ).toBeNull();
  });

  it('requires verified started-history state, never inferring it from enabled alone', () => {
    expect(pilotOperationsSnapshot({ ...snapshot, started: 'yes' })).toBeNull();
    expect(pilotOperationsSnapshot({ ...snapshot, started: true })?.started).toBe(true);
    expect(pilotOperationsSnapshot({ ...snapshot, enabled: true, started: false })?.started).toBe(
      false,
    );
  });

  it('reads the per-Program nudge flag and keeps older snapshots safely OFF', () => {
    const current = pilotOperationsSnapshot({
      ...snapshot,
      learningFeatures: { ...snapshot.learningFeatures, learningNudges: true },
    });
    expect(current?.learningFeatures.learningNudges).toBe(true);

    const legacy = { ...snapshot, learningFeatures: { ...snapshot.learningFeatures } };
    delete (legacy.learningFeatures as Partial<typeof legacy.learningFeatures>).learningNudges;
    expect(pilotOperationsSnapshot(legacy)?.learningFeatures.learningNudges).toBe(false);
  });

  it('includes all five per-Program switches in the reviewed settings command', () => {
    const features = {
      conversation: true,
      multiTopic: false,
      lineLearning: true,
      extendedScope: false,
      learningNudges: true,
    };
    expect(
      createPilotOperationCommand(snapshot, 'SET_LEARNING_FEATURES', evidence, true, features),
    ).toMatchObject({ action: 'SET_LEARNING_FEATURES', learningFeatures: features });
  });

  it('shows Japanese guidance and does not reveal raw internal error strings', () => {
    expect(pilotOperationErrorMessage('PILOT_DEFINITION_APPROVAL_REQUIRED')).toContain(
      '学習Definition',
    );
    expect(pilotOperationErrorMessage('PILOT_WAVE0_CONFIGURATION_REQUIRED')).toContain(
      'Call Admission',
    );
    expect(pilotOperationErrorMessage('PILOT_PROFILE_REQUIRED')).toContain('本人Profile');
    expect(pilotOperationErrorMessage('UNKNOWN_INTERNAL_SECRET')).not.toContain(
      'UNKNOWN_INTERNAL_SECRET',
    );
  });

  it('performs POST then a fresh GET and accepts STOP even when runtime flags are on', async () => {
    const stopSnapshot = { ...snapshot, started: true, status: 'ACTIVE', enabled: true };
    const command = createPilotOperationCommand(stopSnapshot, 'STOP', evidence, true)!;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: { status: 'SUSPENDED' } }))
      .mockResolvedValueOnce(
        Response.json({ data: { ...stopSnapshot, status: 'SUSPENDED', enabled: false } }),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await submitPilotOperation('/endpoint', command)).toEqual({ result: 'SAVED' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('prompts a fresh read for stale state and preserves pending command after unknown response', async () => {
    const command = createPilotOperationCommand(snapshot, 'START', evidence, true)!;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { reason: 'PILOT_STATE_CHANGED' } }, { status: 409 }),
        ),
    );
    expect(await submitPilotOperation('/endpoint', command)).toMatchObject({
      result: 'REJECTED',
      message: expect.stringContaining('再取得'),
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unknown')));
    expect(await submitPilotOperation('/endpoint', command)).toEqual({ result: 'RETRY' });
  });

  it('renders an emergency stop explanation without initiating a request during render', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const html = renderToStaticMarkup(<PilotOperationsCard serviceSlug="test" />);
    expect(html).toContain('現在の状態を確認');
    expect(html).toContain('STOPは実行flagの状態に関係なく操作できます');
    expect(fetcher).not.toHaveBeenCalled();
    expect(html).not.toContain('緊急停止</button>');
  });
});
