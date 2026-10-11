import { describe, expect, it, vi } from 'vitest';
import {
  MonitorStaleAiProviderAdmissions,
  type AiProviderStaleAdmissionAlertPort,
  type AiProviderStaleAdmissionAlertRepository,
  type StaleAiProviderAdmissionBatch,
} from '../src/index';

const now = new Date('2026-10-11T12:00:00.000Z');
const batch = {
  admissionIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
  summaries: [
    {
      provider: 'OPENAI' as const,
      openCount: 2,
      reservedCostUsdMicros: 750,
      oldestAdmittedAt: new Date('2026-10-11T10:00:00.000Z'),
    },
  ],
  truncated: false,
};

function dependencies(value: StaleAiProviderAdmissionBatch = batch) {
  const list = vi.fn().mockResolvedValue(value);
  const record = vi.fn().mockResolvedValue(value.admissionIds.length);
  const notify = vi.fn().mockResolvedValue(undefined);
  const repository: AiProviderStaleAdmissionAlertRepository = {
    listStaleAdmissionsForAlert: list,
    recordStaleAdmissionAlert: record,
  };
  const notifier: AiProviderStaleAdmissionAlertPort = { notify };
  return { repository, notifier, list, record, notify };
}

describe('AI provider stale admission alert', () => {
  it('notifies once and records only after delivery succeeds', async () => {
    const { repository, notifier, list, record, notify } = dependencies();
    const result = await new MonitorStaleAiProviderAdmissions(
      repository,
      notifier,
      () => now,
    ).execute('PRODUCTION');

    expect(list).toHaveBeenCalledWith({
      environment: 'PRODUCTION',
      staleBefore: new Date('2026-10-11T11:45:00.000Z'),
      repeatBefore: new Date('2026-10-11T11:00:00.000Z'),
      limit: 1_000,
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'PRODUCTION',
        summaries: batch.summaries,
        fingerprint: expect.stringMatching(/^[a-f0-9]{8}$/),
      }),
    );
    expect(record).toHaveBeenCalledWith({
      environment: 'PRODUCTION',
      admissionIds: batch.admissionIds,
      repeatBefore: new Date('2026-10-11T11:00:00.000Z'),
      alertedAt: now,
    });
    expect(notify.mock.invocationCallOrder[0]).toBeLessThan(record.mock.invocationCallOrder[0]!);
    expect(result).toMatchObject({ notified: true, recorded: 2 });
  });

  it('uses one fingerprint per admission set and UTC hour for concurrent-send idempotency', async () => {
    const first = dependencies();
    const concurrent = dependencies();
    const nextHour = dependencies();
    const firstResult = await new MonitorStaleAiProviderAdmissions(
      first.repository,
      first.notifier,
      () => now,
    ).execute('PRODUCTION');
    const concurrentResult = await new MonitorStaleAiProviderAdmissions(
      concurrent.repository,
      concurrent.notifier,
      () => new Date('2026-10-11T12:59:59.000Z'),
    ).execute('PRODUCTION');
    const nextHourResult = await new MonitorStaleAiProviderAdmissions(
      nextHour.repository,
      nextHour.notifier,
      () => new Date('2026-10-11T13:00:00.000Z'),
    ).execute('PRODUCTION');

    expect(firstResult.assessment.fingerprint).toBe(concurrentResult.assessment.fingerprint);
    expect(nextHourResult.assessment.fingerprint).not.toBe(firstResult.assessment.fingerprint);
  });

  it('does not record when delivery fails', async () => {
    const { repository, notifier, notify, record } = dependencies();
    notify.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      new MonitorStaleAiProviderAdmissions(repository, notifier, () => now).execute('PRODUCTION'),
    ).rejects.toThrow('provider unavailable');
    expect(record).not.toHaveBeenCalled();
  });

  it('keeps an alert pending when no notifier is configured', async () => {
    const { repository, record } = dependencies();
    await expect(
      new MonitorStaleAiProviderAdmissions(repository, null, () => now).execute('PRODUCTION'),
    ).resolves.toMatchObject({ notified: false, recorded: 0 });
    expect(record).not.toHaveBeenCalled();
  });

  it('does nothing when no stale reservation exists', async () => {
    const empty = { admissionIds: [], summaries: [], truncated: false };
    const { repository, notifier, notify } = dependencies(empty);
    await expect(
      new MonitorStaleAiProviderAdmissions(repository, notifier, () => now).execute('PRODUCTION'),
    ).resolves.toMatchObject({ notified: false, recorded: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('fails closed for an inconsistent repository snapshot', async () => {
    const { repository, notifier, notify } = dependencies({
      admissionIds: batch.admissionIds,
      summaries: [{ ...batch.summaries[0]!, openCount: 1 }],
      truncated: false,
    });
    await expect(
      new MonitorStaleAiProviderAdmissions(repository, notifier, () => now).execute('PRODUCTION'),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(notify).not.toHaveBeenCalled();
  });
});
