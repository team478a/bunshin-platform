import 'server-only';
import {
  FinishOrganizationAiGeneration,
  ReserveOrganizationAiGeneration,
  type OrganizationAiGenerationReservationRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export async function withOrganizationAiGenerationQuota<T>(input: {
  workspaceId: string;
  operationKey: string;
  generate(): Promise<T>;
  repository?: OrganizationAiGenerationReservationRepository;
}): Promise<T> {
  const repository =
    input.repository ??
    new (await import('@bunshin/database')).PrismaOrganizationAiGenerationReservationRepository();
  const reservation = await new ReserveOrganizationAiGeneration(repository).execute({
    workspaceId: input.workspaceId,
    operationKey: input.operationKey,
  });

  if (reservation.status === 'EXHAUSTED') {
    throw new ApplicationError('FORBIDDEN', 'organization monthly AI generation limit reached');
  }

  const ownsReservation = reservation.status === 'RESERVED';
  try {
    const result = await input.generate();
    if (ownsReservation) {
      await new FinishOrganizationAiGeneration(repository).execute({
        workspaceId: input.workspaceId,
        operationKey: input.operationKey,
        outcome: 'CONSUMED',
      });
    }
    return result;
  } catch (error) {
    if (ownsReservation) {
      await new FinishOrganizationAiGeneration(repository).execute({
        workspaceId: input.workspaceId,
        operationKey: input.operationKey,
        outcome: 'RELEASED',
      });
    }
    throw error;
  }
}
