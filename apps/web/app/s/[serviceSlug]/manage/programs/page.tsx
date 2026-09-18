import { notFound, redirect } from 'next/navigation';
import { parseAiResaleOfferTerms, parseAiResaleRuntimeSettings } from '@bunshin/capability-resale';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ProgramManagementEditor } from './program-management-editor';
import { AiResaleOfferAdmin } from './ai-resale-offer-admin';

export const dynamic = 'force-dynamic';
type SupportMode = 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';
const modes = ['IDEA_ONLY', 'GUIDED', 'READY_TO_USE'] as const;
const readModes = (value: unknown): SupportMode[] => {
  if (!value || typeof value !== 'object' || !('supportModes' in value)) return [];
  const raw = (value as { supportModes?: unknown }).supportModes;
  return Array.isArray(raw)
    ? raw.filter((item): item is SupportMode => modes.includes(item as SupportMode))
    : [];
};

export default async function ServiceProgramsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/programs`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const [templates, versions, servicePrograms, offerings, enrollments, memberships] =
    await Promise.all([
      db.prisma.programTemplate.findMany({
        where: {
          workspaceId: service.workspaceId,
          status: 'ACTIVE',
          OR: [{ visibility: 'PLATFORM' }, { ownerGroupId: service.serviceId }],
        },
      }),
      db.prisma.programTemplateVersion.findMany({
        where: { workspaceId: service.workspaceId, status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
      }),
      db.prisma.serviceProgram.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: { in: ['DRAFT', 'ACTIVE', 'SUSPENDED'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.prisma.programOffering.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: 'ACTIVE',
          isFree: true,
        },
        orderBy: { version: 'desc' },
      }),
      db.prisma.programEnrollment.findMany({
        where: { workspaceId: service.workspaceId, groupId: service.serviceId },
        select: {
          id: true,
          serviceProgramId: true,
          groupMembershipId: true,
          status: true,
          updatedAt: true,
        },
      }),
      db.prisma.groupMembership.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: 'ACTIVE',
          serviceRole: 'PARTICIPANT',
        },
        select: { id: true, user: { select: { displayName: true, email: true } } },
        orderBy: { user: { displayName: 'asc' } },
      }),
    ]);
  const adoptedVersionIds = new Set(
    servicePrograms.map((program) => program.programTemplateVersionId),
  );
  const available = versions
    .filter((version) => !adoptedVersionIds.has(version.id))
    .map((version) => {
      const template = templates.find((item) => item.id === version.programTemplateId);
      return template
        ? {
            versionId: version.id,
            name: template.name,
            description: template.description,
            supportModes: readModes(version.definition),
          }
        : null;
    })
    .filter(
      (item): item is NonNullable<typeof item> => item !== null && item.supportModes.length > 0,
    );
  const programs = servicePrograms.flatMap((program) => {
    const offering = offerings.find((item) => item.serviceProgramId === program.id);
    if (!offering) return [];
    return [
      {
        id: program.id,
        name: program.displayName,
        description: program.description,
        offeringId: offering.id,
        supportModes: readModes(offering.termsSnapshot),
        enrolledMembershipIds: enrollments
          .filter((item) => item.serviceProgramId === program.id)
          .map((item) => item.groupMembershipId),
      },
    ];
  });
  const aiPrograms = servicePrograms.flatMap((program) => {
    try {
      const settings = parseAiResaleRuntimeSettings(program.settings);
      return settings ? [{ program, settings }] : [];
    } catch {
      return [];
    }
  });
  const freeProgramIds = aiPrograms
    .filter(({ settings }) => settings.policyKey === 'FREE_7D')
    .map(({ program }) => program.id);
  const paidProgramIds = aiPrograms
    .filter(({ settings }) => settings.policyKey === 'PAID_90D')
    .map(({ program }) => program.id);
  const paidOfferings =
    paidProgramIds.length === 0
      ? []
      : await db.prisma.programOffering.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: { in: paidProgramIds },
            status: 'ACTIVE',
            isFree: false,
          },
          orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        });
  const offerOptions = paidOfferings.flatMap((offering) => {
    const terms = parseAiResaleOfferTerms(offering.termsSnapshot);
    return terms ? [{ offering, terms }] : [];
  });
  const completedFree = enrollments.filter(
    (enrollment) =>
      enrollment.status === 'COMPLETED' && freeProgramIds.includes(enrollment.serviceProgramId),
  );
  const selectedEvents =
    completedFree.length === 0
      ? []
      : await db.prisma.programActionEvent.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            programEnrollmentId: { in: completedFree.map(({ id }) => id) },
            eventType: { in: ['STANDARD_OFFER_SELECTED', 'MONITOR_OFFER_SELECTED'] },
          },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        });
  const activePaidMembershipIds = new Set(
    enrollments
      .filter(
        (enrollment) =>
          enrollment.status === 'ACTIVE' && paidProgramIds.includes(enrollment.serviceProgramId),
      )
      .map(({ groupMembershipId }) => groupMembershipId),
  );
  const seenApplicants = new Set<string>();
  const pendingApplicants = selectedEvents.flatMap((event) => {
    const enrollment = completedFree.find(({ id }) => id === event.programEnrollmentId);
    if (
      !enrollment ||
      activePaidMembershipIds.has(enrollment.groupMembershipId) ||
      seenApplicants.has(enrollment.groupMembershipId) ||
      !event.sourceResourceId
    ) {
      return [];
    }
    const member = memberships.find(({ id }) => id === enrollment.groupMembershipId);
    const option = offerOptions.find(({ offering }) => offering.id === event.sourceResourceId);
    if (!member || !option) return [];
    seenApplicants.add(enrollment.groupMembershipId);
    return [
      {
        groupMembershipId: enrollment.groupMembershipId,
        name: member.user.displayName,
        email: member.user.email,
        offerKind: option.terms.offerKey,
        offeringId: option.offering.id,
        amountYen: option.terms.amountYen,
        requestedAt: event.occurredAt.toISOString(),
      },
    ];
  });
  const standard = offerOptions.find(({ terms }) => terms.offerKey === 'STANDARD') ?? null;
  const monitor = offerOptions.find(({ terms }) => terms.offerKey === 'MONITOR') ?? null;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>実践プログラム</h1>
          <p>公式プログラムを選び、参加者へ必要な内容を無料で割り当てます。</p>
          <a href={`/s/${serviceSlug}/home`}>← サービスのホームへ戻る</a>
        </header>
        <ProgramManagementEditor
          serviceSlug={serviceSlug}
          available={available}
          programs={programs}
          members={memberships.map((membership) => ({
            id: membership.id,
            name: membership.user.displayName,
            email: membership.user.email,
          }))}
        />
        <AiResaleOfferAdmin
          serviceSlug={serviceSlug}
          enabled={freeProgramIds.length > 0}
          standard={
            standard
              ? {
                  offeringId: standard.offering.id,
                  amountYen: standard.terms.amountYen,
                  applicationUrl: standard.terms.applicationUrl,
                }
              : null
          }
          monitor={
            monitor
              ? {
                  offeringId: monitor.offering.id,
                  amountYen: monitor.terms.amountYen,
                  applicationUrl: monitor.terms.applicationUrl,
                }
              : null
          }
          pendingApplicants={pendingApplicants}
        />
      </main>
    </PublicShell>
  );
}
