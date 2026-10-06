import { z } from 'zod';

export const profilePreparationValues = z.object({
  role: z.enum(['SALES', 'OFFICE', 'MANAGER', 'OTHER']),
  aiLevel: z.enum(['BEGINNER', 'INTERMEDIATE']),
  dailyMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
});
export type PreparedLearningProfile = z.infer<typeof profilePreparationValues>;
export type ProfilePreparationCommand = PreparedLearningProfile & {
  operationId: string;
  confirmation: 'CONFIRM_MY_LEARNING_PROFILE';
  expectedAbsent: true;
};
export function profilePreparationCommand(
  draft: { role: string; aiLevel: string; dailyMinutes: string },
  confirmed: boolean,
): ProfilePreparationCommand | null {
  if (!confirmed || !draft.dailyMinutes) return null;
  const parsed = profilePreparationValues.safeParse({
    role: draft.role,
    aiLevel: draft.aiLevel,
    dailyMinutes: Number(draft.dailyMinutes),
  });
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    operationId: crypto.randomUUID(),
    confirmation: 'CONFIRM_MY_LEARNING_PROFILE',
    expectedAbsent: true,
  };
}

export async function submitProfilePreparation(
  endpoint: string,
  command: ProfilePreparationCommand,
): Promise<'SAVED' | 'RETRY' | 'CLOSED' | 'CONFLICT'> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    if ([401, 403, 404].includes(response.status)) return 'CLOSED';
    if (response.status === 409 || response.status === 400 || response.status === 413)
      return 'CONFLICT';
    if (!response.ok) return 'RETRY';
    const receipt = z
      .object({
        data: z.object({
          outcome: z.enum(['INITIALIZED', 'ALREADY_INITIALIZED']),
          profile: profilePreparationValues,
        }),
      })
      .safeParse(await response.json());
    if (!receipt.success) return 'RETRY';
    const profile = receipt.data.data.profile;
    return profile.role === command.role &&
      profile.aiLevel === command.aiLevel &&
      profile.dailyMinutes === command.dailyMinutes
      ? 'SAVED'
      : 'CONFLICT';
  } catch {
    // A lost response may follow a committed save; retain the exact request for replay.
    return 'RETRY';
  }
}
