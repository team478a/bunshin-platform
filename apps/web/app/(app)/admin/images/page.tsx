import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerEnvironment } from '@bunshin/config';
import { ListSocialImagePilotEvidence } from '@bunshin/application';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { buildSocialImagePilotStatus } from '../../../../src/social-image-pilot-status';
import { ImagePilotEvidenceEditor } from './evidence-editor';
import { buildImagePilotReadiness } from './readiness-view-model';
import {
  ImagePilotGroupSelector,
  ImagePilotReadiness,
  ImagePilotStatus,
} from './image-pilot-admin-overview';
import { ImagePilotSettingsForm } from './image-pilot-settings-form';

export const dynamic = 'force-dynamic';

export default async function ImagePilotAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string; saved?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, status: 'ACTIVE' },
    select: { role: true },
  });
  if (!admin) notFound();

  const groups = await db.prisma.group.findMany({
    where: {
      status: 'ACTIVE',
      featurePolicies: { some: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' } },
    },
    select: { id: true, workspaceId: true, name: true, workspace: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  const query = await searchParams;
  const selected = groups.find((group) => group.id === query.groupId) ?? groups[0];
  const pilot = selected
    ? await db.prisma.socialImageGenerationPilot.findFirst({
        where: { workspaceId: selected.workspaceId, groupId: selected.id, status: 'ACTIVE' },
        include: {
          enrollments: { where: { status: 'ACTIVE' }, select: { groupMembershipId: true } },
        },
        orderBy: { version: 'desc' },
      })
    : null;
  const evidence =
    selected && pilot
      ? await new ListSocialImagePilotEvidence(
          new db.PrismaSocialImagePilotEvidenceRepository(),
        ).execute({
          workspaceId: selected.workspaceId,
          groupId: selected.id,
          pilotId: pilot.id,
          actorUserId: actor.userId,
        })
      : [];
  const members = selected
    ? await db.prisma.groupMembership.findMany({
        where: { workspaceId: selected.workspaceId, groupId: selected.id, status: 'ACTIVE' },
        select: {
          id: true,
          consentedAt: true,
          user: { select: { displayName: true, email: true } },
          featureAssignments: {
            where: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
            select: { id: true },
          },
        },
        orderBy: { user: { displayName: 'asc' } },
      })
    : [];
  const enrolled = new Set(pilot?.enrollments.map((item) => item.groupMembershipId) ?? []);
  const provider = await db.prisma.aiProviderConfiguration.findFirst({
    where: { environment: currentAiProviderEnvironment(), provider: 'OPENAI', status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: {
      apiKeyMask: true,
      lastVerifiedAt: true,
      globallyPaused: true,
      lastErrorCategory: true,
    },
  });
  const environment = getServerEnvironment();
  const now = new Date();
  const effectiveStatus = buildSocialImagePilotStatus({ pilot, evidence, now });
  const readiness = buildImagePilotReadiness({
    now,
    pilot,
    enrolledCount: enrolled.size,
    provider: provider
      ? {
          apiKeyConfigured: Boolean(provider.apiKeyMask),
          lastVerifiedAt: provider.lastVerifiedAt,
          globallyPaused: provider.globallyPaused,
          lastErrorCategory: provider.lastErrorCategory,
        }
      : null,
    storageConfigured: Boolean(
      (process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL) &&
      environment.SUPABASE_SERVICE_ROLE_KEY,
    ),
  });
  const requestCounts = selected
    ? await db.prisma.socialImageGenerationRequest.groupBy({
        by: ['status'],
        where: { workspaceId: selected.workspaceId, groupId: selected.id },
        _count: { _all: true },
      })
    : [];
  const count = (status: string) =>
    requestCounts.find((item) => item.status === status)?._count._all ?? 0;
  const total = requestCounts.reduce((sum, item) => sum + item._count._all, 0);
  const preflightUsed = total - count('FAILED') - count('CANCELLED') > 0;
  const requestIds = selected
    ? await db.prisma.socialImageGenerationRequest.findMany({
        where: { workspaceId: selected.workspaceId, groupId: selected.id },
        select: { id: true },
        take: 500,
      })
    : [];
  const requestIdSet = new Set(requestIds.map((item) => item.id));
  const imageUsage = selected
    ? await db.prisma.aiUsageEvent.findMany({
        where: { workspaceId: selected.workspaceId, taskType: 'SOCIAL_IMAGE_GENERATION' },
        select: { idempotencyKey: true, estimatedCostUsdMicros: true },
        orderBy: { occurredAt: 'desc' },
        take: 2000,
      })
    : [];
  const costMicros = imageUsage.reduce((sum, item) => {
    const requestId = item.idempotencyKey.split(':')[1];
    return requestId && requestIdSet.has(requestId)
      ? sum + (item.estimatedCostUsdMicros ?? 0n)
      : sum;
  }, 0n);
  const latestEvidence = new Map(evidence.map((item) => [item.checkKey, item.action]));
  const preflightReady =
    effectiveStatus.state === 'PREPARING' &&
    latestEvidence.get('PLAN_APPROVAL') === 'RECORDED' &&
    latestEvidence.get('STORAGE_RETENTION') === 'RECORDED' &&
    latestEvidence.get('FINAL_APPROVAL') === undefined &&
    !preflightUsed;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>画像生成の試験運用</h1>
        <p>試すグループと参加者を限定し、上限設定や緊急停止を画面から行えます。</p>
      </header>
      {query.saved === '1' ? <p className="notice notice--success">設定を保存しました。</p> : null}
      {query.error ? (
        <p className="notice notice--danger">
          保存できませんでした。入力と利用機能の設定を確認してください。
        </p>
      ) : null}
      <ImagePilotGroupSelector groups={groups} selectedGroupId={selected?.id} />
      {selected ? (
        <>
          {admin.role === 'SUPER_ADMIN' ? (
            <section className="settings-card">
              <h2>まず投稿画像を試作する</h2>
              <p>自分の投稿パートナーで画像を作り、文字と雰囲気を確認できます。</p>
              <Link href={{ pathname: '/admin/images/samples', query: { groupId: selected.id } }}>
                投稿画像を1枚作る
              </Link>
            </section>
          ) : null}
          <ImagePilotStatus
            groupId={selected.id}
            pilotVersion={pilot?.version ?? null}
            state={effectiveStatus.state}
            label={effectiveStatus.label}
            remainingChecks={effectiveStatus.remainingChecks}
            preflightReady={preflightReady}
            preflightUsed={preflightUsed}
            enrolledCount={enrolled.size}
            total={total}
            readyCount={count('READY_FOR_REVIEW')}
            failedCount={count('FAILED')}
            costUsd={(Number(costMicros) / 1_000_000).toFixed(2)}
          />
          {pilot ? (
            <ImagePilotEvidenceEditor
              workspaceId={selected.workspaceId}
              groupId={selected.id}
              pilotId={pilot.id}
              canEdit={admin.role === 'SUPER_ADMIN'}
              initialEvidence={evidence.map((item) => ({
                ...item,
                occurredAt: item.occurredAt.toISOString(),
              }))}
            />
          ) : (
            <section className="settings-card">
              <h2>開始前に人が確認すること</h2>
              <p>先に試験設定を保存すると、確認項目を記録できるようになります。</p>
            </section>
          )}
          <ImagePilotReadiness readiness={readiness} />
          <ImagePilotSettingsForm
            workspaceId={selected.workspaceId}
            groupId={selected.id}
            pilot={pilot}
            members={members}
            enrolled={enrolled}
            canEdit={admin.role === 'SUPER_ADMIN'}
          />
        </>
      ) : null}
    </main>
  );
}
