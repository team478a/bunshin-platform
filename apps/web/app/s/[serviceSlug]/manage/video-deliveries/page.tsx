import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { VideoDeliveryManager, type VideoDeliveryCandidate } from './video-delivery-manager';

export const dynamic = 'force-dynamic';

export default async function VideoDeliveryManagementPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/video-deliveries`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const [renders, enrollments, servicePrograms, existingDeliveries] = await Promise.all([
    db.prisma.videoRender.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'SUCCEEDED',
        outputStorageKey: { not: null },
        project: {
          is: {
            groupMembership: {
              is: { status: 'ACTIVE', serviceRole: 'PARTICIPANT' },
            },
          },
        },
      },
      select: {
        id: true,
        groupMembershipId: true,
        completedAt: true,
        project: {
          select: {
            id: true,
            title: true,
            groupMembership: { select: { user: { select: { displayName: true, email: true } } } },
          },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: 100,
    }),
    db.prisma.programEnrollment.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: { in: ['INVITED', 'ACTIVE'] },
      },
      select: {
        id: true,
        groupMembershipId: true,
        serviceProgramId: true,
      },
    }),
    db.prisma.serviceProgram.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: { id: true, displayName: true },
    }),
    db.prisma.videoDelivery.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: { videoRenderId: true },
    }),
  ]);
  const deliveredRenderIds = new Set(
    (existingDeliveries as Array<{ videoRenderId: string }>).map(
      (delivery) => delivery.videoRenderId,
    ),
  );
  const enrollmentRows = enrollments as Array<{
    id: string;
    groupMembershipId: string;
    serviceProgramId: string;
  }>;
  const programRows = servicePrograms as Array<{ id: string; displayName: string }>;
  const candidates: VideoDeliveryCandidate[] = renders
    .filter((render) => !deliveredRenderIds.has(render.id))
    .map((render) => ({
      membershipId: render.groupMembershipId,
      videoProjectId: render.project.id,
      videoRenderId: render.id,
      memberName:
        render.project.groupMembership.user.displayName ||
        render.project.groupMembership.user.email ||
        '参加者',
      title: render.project.title,
      completedAt: render.completedAt?.toISOString() ?? null,
      enrollments: enrollmentRows
        .filter((enrollment) => enrollment.groupMembershipId === render.groupMembershipId)
        .flatMap((enrollment) => {
          const program = programRows.find((item) => item.id === enrollment.serviceProgramId);
          return program ? [{ id: enrollment.id, label: program.displayName }] : [];
        }),
    }));
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>個別動画の確認依頼</h1>
          <p>完成した個別動画を、対象の参加者だけが確認・採用できる状態にします。</p>
          <a href={`/s/${serviceSlug}/manage`}>← 管理メニューへ戻る</a>
        </header>
        <VideoDeliveryManager serviceSlug={serviceSlug} candidates={candidates} />
      </main>
    </PublicShell>
  );
}
