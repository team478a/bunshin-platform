import 'server-only';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { resolveManagedServiceContext } from '../services/public-service';
import { programPreparationTarget } from '../services/personal-learning-program-preparation';
import {
  personalLearningPreparationAccess,
  recheckPersonalLearningPreparationAccess,
} from '../services/personal-learning-preparation-access';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
/** Read-only own-target projection. Mutations stay in the existing trusted operations. */
export async function personalLearningInternalPreparationResponse(request: Request, slug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    if (request.method !== 'GET')
      return Response.json({ requestId }, { status: 405, headers: { ...headers, allow: 'GET' } });
    if (new URL(request.url).search)
      throw new ApplicationError('VALIDATION_ERROR', 'query not accepted');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(slug, actor.userId);
    const authority = personalLearningPreparationAccess(
      'PERSONAL_LEARNING_PARTICIPANT_PREPARATION',
    );
    if (!authority || programPreparationTarget(service) !== authority.serviceProgramId)
      throw new ApplicationError('NOT_FOUND', 'preparation unavailable');
    const db = await import('@bunshin/database');
    const operation = await new db.PrismaPersonalLearningPilotOperations(
      db.prisma,
      authority,
      () => {
        recheckPersonalLearningPreparationAccess(
          'PERSONAL_LEARNING_PARTICIPANT_PREPARATION',
          authority,
        );
        if (programPreparationTarget(service) !== authority.serviceProgramId)
          throw new ApplicationError('NOT_FOUND', 'preparation changed');
      },
    ).read(actor.userId);
    const participants = await new db.PrismaPersonalLearningParticipantAdminRepository(
      db.prisma,
      authority,
    ).read(actor.userId);
    const membership = await db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: authority.workspaceId,
        groupId: authority.groupId,
        userId: actor.userId,
        status: 'ACTIVE',
        serviceRole: 'SERVICE_OWNER',
      },
      select: { id: true },
    });
    if (!membership) throw new ApplicationError('NOT_FOUND', 'owner preparation unavailable');
    const enrollment = await db.prisma.programEnrollment.findFirst({
      where: { ...authority, groupMembershipId: membership.id },
      select: { id: true, status: true, supportMode: true, startsAt: true, endsAt: true },
    });
    const now = new Date();
    const offerings = await db.prisma.programOffering.findMany({
      where: { ...authority, status: 'ACTIVE', isFree: true, priceReference: null },
      select: { id: true, termsSnapshot: true, startsAt: true, endsAt: true },
    });
    const eligible = offerings.filter((o) => {
      const terms = o.termsSnapshot as { participation?: string; supportModes?: unknown } | null;
      return (
        terms?.participation === 'INVITATION_ONLY' &&
        Array.isArray(terms.supportModes) &&
        terms.supportModes.includes('GUIDED') &&
        (!o.startsAt || o.startsAt <= now) &&
        (!o.endsAt || o.endsAt > now)
      );
    });
    const seat = enrollment
      ? participants.seats.find((s) => s.programEnrollmentId === enrollment.id)
      : undefined;
    recheckPersonalLearningPreparationAccess(
      'PERSONAL_LEARNING_PARTICIPANT_PREPARATION',
      authority,
    );
    if (programPreparationTarget(service) !== authority.serviceProgramId)
      throw new ApplicationError('NOT_FOUND', 'preparation changed');
    return Response.json(
      {
        data: {
          operation,
          policy: participants.policy,
          groupMembershipId: membership.id,
          programOfferingId: eligible.length === 1 ? eligible[0]!.id : null,
          programEnrollmentId: enrollment?.id ?? null,
          enrollmentReady:
            !!enrollment &&
            enrollment.status === 'ACTIVE' &&
            enrollment.supportMode === 'GUIDED' &&
            (!enrollment.startsAt || enrollment.startsAt <= now) &&
            enrollment.endsAt === null,
          seatStatus: !seat
            ? 'ABSENT'
            : seat.revokedAt
              ? 'REVOKED'
              : seat.kind === 'INTERNAL' && seat.cohort === 'INTERNAL'
                ? 'INTERNAL'
                : 'OTHER',
        },
        requestId,
      },
      { headers },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
