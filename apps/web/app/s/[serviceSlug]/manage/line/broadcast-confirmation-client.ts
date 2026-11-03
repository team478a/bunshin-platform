import { z } from 'zod';

const segmentSchema = z
  .object({
    industryIds: z.array(z.uuid()).max(20),
    purposes: z
      .array(z.enum(['ATTRACT', 'RESERVATION', 'SALES', 'RECRUITING', 'AWARENESS', 'RETENTION']))
      .max(6),
  })
  .strict();
const draftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(5000),
    reason: z.string().trim().min(1).max(1000),
    scheduledAt: z.string().datetime().optional(),
    segment: segmentSchema,
  })
  .strict();
const commandSchema = draftSchema
  .extend({
    operationId: z.uuid(),
    expectedRecipientCount: z.number().int().min(1).max(500),
    confirmed: z.literal('SERVICE_LINE_BROADCAST_SCHEDULE_V1'),
  })
  .strict();
export type BroadcastDraft = z.infer<typeof draftSchema>;
export type BroadcastCommand = z.infer<typeof commandSchema>;
export const parseBroadcastDraft = (value: unknown) => {
  const result = draftSchema.safeParse(value);
  return result.success ? result.data : null;
};
export const broadcastEndpoint = (slug: string) =>
  `/api/services/${encodeURIComponent(slug)}/line-broadcasts`;
export async function previewBroadcast(slug: string, draft: BroadcastDraft) {
  const response = await fetch(`${broadcastEndpoint(slug)}/preview`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft.segment),
  });
  if (!response.ok) return null;
  const parsed = z
    .object({
      data: z.object({
        reservationContract: z.literal('SERVICE_LINE_BROADCAST_SCHEDULE_V1'),
        eligibleRecipientCount: z.number().int().min(0).max(500),
        capped: z.boolean(),
      }),
    })
    .safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}
export function broadcastCommand(draft: BroadcastDraft, count: number): BroadcastCommand {
  return commandSchema.parse({
    ...draft,
    operationId: crypto.randomUUID(),
    expectedRecipientCount: count,
    confirmed: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
  });
}
const receiptSchema = z.object({
  broadcastId: z.uuid(),
  requested: z.number().int().min(1).max(500),
  scheduledAt: z.string().datetime(),
  replayed: z.boolean(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED']),
});
export async function submitBroadcast(
  slug: string,
  command: BroadcastCommand,
): Promise<
  | { kind: 'RECEIVED'; receipt: z.infer<typeof receiptSchema> }
  | { kind: 'UNKNOWN' }
  | { kind: 'REJECTED' }
> {
  if (!commandSchema.safeParse(command).success) return { kind: 'REJECTED' };
  try {
    const response = await fetch(broadcastEndpoint(slug), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok)
      return { kind: response.status >= 500 || response.status === 429 ? 'UNKNOWN' : 'REJECTED' };
    const parsed = z.object({ data: receiptSchema }).safeParse(await response.json());
    if (
      !parsed.success ||
      parsed.data.data.broadcastId !== command.operationId ||
      parsed.data.data.requested !== command.expectedRecipientCount ||
      (command.scheduledAt !== undefined && parsed.data.data.scheduledAt !== command.scheduledAt)
    )
      return { kind: 'UNKNOWN' };
    return { kind: 'RECEIVED', receipt: parsed.data.data };
  } catch {
    return { kind: 'UNKNOWN' };
  }
}
