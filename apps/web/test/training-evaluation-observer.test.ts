import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeTrainingEvaluation } from '../src/services/training-evaluation-observer';

afterEach(() => vi.useRealTimers());

describe('bounded read-only evaluation observation', () => {
  it('reads PENDING then restores READY without submitting or queuing another job', async () => {
    vi.useFakeTimers();
    const evaluation = { result: 'PASS' };
    const read = vi
      .fn()
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValue({ status: 'READY', evaluation });
    const onResult = vi.fn();
    const work = observeTrainingEvaluation({
      read,
      onResult,
      signal: new AbortController().signal,
    });
    await vi.runAllTimersAsync();
    expect(await work).toBe('SETTLED');
    expect(read).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenLastCalledWith({ status: 'READY', evaluation });
  });

  it('returns FAILED without automatically retrying the assessment', async () => {
    const read = vi.fn().mockResolvedValue({ status: 'FAILED' });
    const onResult = vi.fn();
    expect(
      await observeTrainingEvaluation({ read, onResult, signal: new AbortController().signal }),
    ).toBe('SETTLED');
    expect(read).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({ status: 'FAILED' });
  });

  it('bounds automatic GETs and leaves slow assessments waiting, never passed', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue({ status: 'PENDING' });
    const onResult = vi.fn();
    const work = observeTrainingEvaluation({
      read,
      onResult,
      signal: new AbortController().signal,
    });
    await vi.runAllTimersAsync();
    expect(await work).toBe('WAITING');
    expect(read).toHaveBeenCalledTimes(16);
    expect(onResult.mock.calls.every(([result]) => result.status === 'PENDING')).toBe(true);
  });

  it('discards late results when leaving a page or switching Assignment', async () => {
    const controller = new AbortController();
    let complete!: (value: { status: 'READY'; evaluation: string }) => void;
    const read = vi.fn(
      () =>
        new Promise<{ status: 'READY'; evaluation: string }>((resolve) => {
          complete = resolve;
        }),
    );
    const onResult = vi.fn();
    const work = observeTrainingEvaluation({ read, onResult, signal: controller.signal });
    controller.abort();
    complete({ status: 'READY', evaluation: 'old assignment' });
    expect(await work).toBe('CANCELLED');
    expect(onResult).not.toHaveBeenCalled();
  });

  it('cleans the timer immediately on unmount', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const read = vi.fn().mockResolvedValue({ status: 'PENDING' });
    const work = observeTrainingEvaluation({ read, onResult: vi.fn(), signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await work).toBe('CANCELLED');
    expect(vi.getTimerCount()).toBe(0);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not convert a failed authorization/network read to a learning success', async () => {
    const onResult = vi.fn();
    const read = vi.fn().mockRejectedValue(new Error('not authorized'));
    await expect(
      observeTrainingEvaluation({ read, onResult, signal: new AbortController().signal }),
    ).rejects.toThrow('not authorized');
    expect(onResult).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
