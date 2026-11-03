import { z } from 'zod';

export type BroadcastHistoryAction = 'retry' | 'cancel';
const reasonSchema = z.string().trim().min(1).max(1000);
const receiptSchema = z.object({
  data: z.object({
    broadcastId: z.string(),
    retried: z.number().int().positive().optional(),
    cancelledAt: z.string().datetime().optional(),
  }),
});

export async function submitBroadcastHistoryAction(
  serviceSlug: string,
  broadcastId: string,
  action: BroadcastHistoryAction,
  reason: string,
): Promise<'CONFIRMED' | 'REJECTED' | 'UNKNOWN'> {
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) return 'REJECTED';
  try {
    const response = await fetch(
      `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts/${encodeURIComponent(broadcastId)}/${action}`,
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: parsed.data }),
      },
    );
    if (!response.ok)
      return response.status >= 400 && response.status < 500 && response.status !== 429
        ? 'REJECTED'
        : 'UNKNOWN';
    const result = receiptSchema.safeParse(await response.json());
    if (!result.success || result.data.data.broadcastId !== broadcastId) return 'UNKNOWN';
    return (action === 'retry' ? result.data.data.retried : result.data.data.cancelledAt)
      ? 'CONFIRMED'
      : 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}
