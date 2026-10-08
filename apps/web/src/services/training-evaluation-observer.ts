/** Browser-side, read-only observation. Never starts or retries a Provider job. */
export type EvaluationObservation<T> =
  { status: 'PENDING' } | { status: 'READY'; evaluation: T } | { status: 'FAILED' };

export async function observeTrainingEvaluation<T>(input: {
  read: (signal: AbortSignal) => Promise<EvaluationObservation<T>>;
  signal: AbortSignal;
  onResult: (result: EvaluationObservation<T>) => void;
}): Promise<'SETTLED' | 'WAITING' | 'CANCELLED'> {
  const attempts = 16;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (input.signal.aborted) return 'CANCELLED';
    const result = await input.read(input.signal);
    // An old request may finish after navigation even if its transport ignores abort.
    if (input.signal.aborted) return 'CANCELLED';
    input.onResult(result);
    if (result.status !== 'PENDING') return 'SETTLED';
    if (attempt + 1 < attempts) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          input.signal.removeEventListener('abort', finish);
          resolve();
        };
        const timer = setTimeout(finish, 2_000);
        input.signal.addEventListener('abort', finish, { once: true });
        if (input.signal.aborted) finish();
      });
    }
  }
  return input.signal.aborted ? 'CANCELLED' : 'WAITING';
}
