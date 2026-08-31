import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ProgramManagementEditor } from './program-management-editor';

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
        select: { serviceProgramId: true, groupMembershipId: true },
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
      </main>
    </PublicShell>
  );
}
