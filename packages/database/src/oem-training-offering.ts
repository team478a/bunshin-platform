import { parseProgramDefinition } from '@bunshin/application';
import type { Prisma } from './client';

/** Product identity follows the adopted definition, never a brand, slug or zero price. */
export async function requireTrainingOemOffering(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; groupId: string; definition: unknown },
) {
  const training = parseProgramDefinition(input.definition).missions.some(
    (m) => m.capability === 'AI_TRAINING',
  );
  if (!training) return;
  const contract = await tx.organizationCommercialContract.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { id: true },
  });
  if (!contract) return; // Direct/internal pilot is not an OEM commercial offering.
  const offering = await tx.oemOfferingPeriod.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      endsAt: null,
      supersededBy: { is: null },
    },
    include: { productPolicyVersion: true },
  });
  if (!offering?.productPolicyVersion.requiredCapabilities.includes('AI_TRAINING'))
    throw new Error('REVIEW_REQUIRED: AI training OEM product policy');
  if (offering.classification === 'FREE') throw new Error('OEM_PRODUCT_FREE_OFFERING_FORBIDDEN');
}
