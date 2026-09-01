import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import {
  VideoDeliveryManager,
  type VideoDeliveryCandidate,
  type VideoDeliveryStatusRow,
} from './video-delivery-manager';

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
      select: {
        id: true,
        groupMembershipId: true,
        videoProjectId: true,
        videoRenderId: true,
        status: true,
        createdAt: true,
        viewedAt: true,
        acceptedAt: true,
        declinedAt: true,
        postedAt: true,
        expiresAt: true,
        notificationStatus: true,
        notificationErrorCode: true,
        notificationAttemptCount: true,
        notifiedAt: true,
      },
    }),
  ]);
  const deliveredRenderIds = new Set(existingDeliveries.map((delivery) => delivery.videoRenderId));
  const enrollmentRows = enrollments as Array<{
    id: string;
    groupMembershipId: string;
    serviceProgramId: string;
  }>;
  const programRows = servicePrograms as Array<{ id: string; displayName: string }>;
  const deliveryMembershipIds = [
    ...new Set(existingDeliveries.map((delivery) => delivery.groupMembershipId)),
  ];
  const deliveryProjectIds = [
    ...new Set(existingDeliveries.map((delivery) => delivery.videoProjectId)),
  ];
  const [deliveryMemberships, deliveryProjects] = await Promise.all([
    db.prisma.groupMembership.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        id: { in: deliveryMembershipIds },
      },
      select: { id: true, user: { select: { displayName: true, email: true } } },
    }),
    db.prisma.videoProject.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        id: { in: deliveryProjectIds },
      },
      select: { id: true, title: true },
    }),
  ]);
  const deliveryMembersById = new Map(
    deliveryMemberships.map((membership) => [membership.id, membership]),
  );
  const deliveryProjectsById = new Map(deliveryProjects.map((project) => [project.id, project]));
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
  const deliveries: VideoDeliveryStatusRow[] = existingDeliveries.flatMap((delivery) => {
    const membership = deliveryMembersById.get(delivery.groupMembershipId);
    const project = deliveryProjectsById.get(delivery.videoProjectId);
    if (!membership || !project) return [];
    return [
      {
        id: delivery.id,
        memberName: membership.user.displayName || membership.user.email || '参加者',
        title: project.title,
        status:
          delivery.expiresAt !== null && delivery.expiresAt <= new Date()
            ? 'EXPIRED'
            : delivery.status,
        assignedAt: delivery.createdAt.toISOString(),
        viewedAt: delivery.viewedAt?.toISOString() ?? null,
        acceptedAt: delivery.acceptedAt?.toISOString() ?? null,
        declinedAt: delivery.declinedAt?.toISOString() ?? null,
        postedAt: delivery.postedAt?.toISOString() ?? null,
        notificationStatus: delivery.notificationStatus,
        notificationErrorCode: delivery.notificationErrorCode,
        notificationAttemptCount: delivery.notificationAttemptCount,
        notifiedAt: delivery.notifiedAt?.toISOString() ?? null,
      },
    ];
  });
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>個別動画の確認依頼</h1>
          <p>完成した個別動画を、対象の参加者だけが確認・採用できる状態にします。</p>
          <a href={`/s/${serviceSlug}/manage`}>← 管理メニューへ戻る</a>
        </header>
        <VideoDeliveryManager
          candidates={candidates}
          deliveries={deliveries}
          serviceSlug={serviceSlug}
        />
      </main>
    </PublicShell>
  );
}
