import { describe, expect, it, vi } from 'vitest';
import {
  ExportTrainingPersonalData,
  TRAINING_EXPORT_MAX_BYTES,
  TRAINING_EXPORT_MAX_ROWS,
  type TrainingPersonalDataSnapshot,
} from '../src/personal-data-export';

const input = {
  workspaceId: 'workspace',
  groupId: 'service',
  actorUserId: 'owner',
  programEnrollmentId: 'enrollment',
  now: new Date('2026-09-28T12:00:00Z'),
};
const snapshot = (): TrainingPersonalDataSnapshot => ({
  enrollment: { id: 'enrollment' },
  profile: null,
  progress: null,
  assignments: [],
  answers: [{ answer: '自分の回答' }],
  toolkit: [],
  activities: [],
  goals: [],
});

describe('personal training data export', () => {
  it('produces versioned JSON and a filename without personal identifiers', async () => {
    const read = vi.fn().mockResolvedValue({ outcome: 'FOUND', data: snapshot() });
    const result = await new ExportTrainingPersonalData({ read }).execute(input);
    expect(read).toHaveBeenCalledWith(input);
    expect(result.outcome).toBe('EXPORTED');
    if (result.outcome !== 'EXPORTED') throw new Error('expected export');
    expect(JSON.parse(result.json)).toMatchObject({
      schemaVersion: 1,
      exportedAt: input.now.toISOString(),
      answers: [{ answer: '自分の回答' }],
    });
    expect(result.filename).toBe('ai-training-data-2026-09-28.json');
  });
  it('does not manufacture a successful file for a denied or oversized snapshot', async () => {
    for (const outcome of ['NOT_FOUND', 'TOO_LARGE'] as const) {
      expect(
        await new ExportTrainingPersonalData({
          read: vi.fn().mockResolvedValue({ outcome }),
        }).execute(input),
      ).toEqual({ outcome });
    }
  });
  it('rejects over-limit rows instead of silently truncating them', async () => {
    const data = snapshot();
    data.answers = Array.from({ length: TRAINING_EXPORT_MAX_ROWS + 1 }, () => ({ answer: '回答' }));
    expect(
      await new ExportTrainingPersonalData({
        read: vi.fn().mockResolvedValue({ outcome: 'FOUND', data }),
      }).execute(input),
    ).toEqual({ outcome: 'TOO_LARGE' });
  });
  it('enforces bytes, including multibyte Japanese text', async () => {
    const data = snapshot();
    data.answers = [{ answer: 'あ'.repeat(Math.ceil(TRAINING_EXPORT_MAX_BYTES / 3)) }];
    expect(
      await new ExportTrainingPersonalData({
        read: vi.fn().mockResolvedValue({ outcome: 'FOUND', data }),
      }).execute(input),
    ).toEqual({ outcome: 'TOO_LARGE' });
  });
  it('propagates database failures without returning an empty export', async () => {
    await expect(
      new ExportTrainingPersonalData({
        read: vi.fn().mockRejectedValue(new Error('DB unavailable')),
      }).execute(input),
    ).rejects.toThrow('DB unavailable');
  });
});
