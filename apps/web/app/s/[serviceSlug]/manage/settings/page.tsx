import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ServiceSettingsEditor } from './service-settings-editor';

export const dynamic = 'force-dynamic';

export default async function ServiceSettingsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/settings`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const value = service.configuration;
  const db = await import('@bunshin/database');
  const [
    characterProfiles,
    characterVersions,
    characterReferences,
    characterLicenses,
    audioTracks,
  ] = await Promise.all([
    db.prisma.aiCharacterProfile.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        scope: 'SERVICE',
        status: 'ACTIVE',
      },
      select: { id: true, name: true },
    }),
    db.prisma.aiCharacterProfileVersion.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'PUBLISHED',
      },
      select: { id: true, characterProfileId: true, licenseVersionId: true, version: true },
    }),
    db.prisma.aiCharacterReferenceAsset.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'READY',
      },
      select: { characterProfileVersionId: true },
    }),
    db.prisma.aiCharacterLicenseVersion.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        commercialUseAllowed: true,
        derivativeUseAllowed: true,
        redistributionAllowed: true,
        startsAt: { lte: new Date() },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
      select: { id: true },
    }),
    db.prisma.videoAsset.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        ownerUserId: actor.userId,
        kind: 'AUDIO',
        status: 'READY',
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, originalFilename: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  const referenceVersionIds = new Set(
    characterReferences.map((reference) => reference.characterProfileVersionId),
  );
  const activeLicenseIds = new Set(characterLicenses.map((license) => license.id));
  const visualCharacters = characterVersions.flatMap((version) => {
    const profile = characterProfiles.find((item) => item.id === version.characterProfileId);
    return profile &&
      referenceVersionIds.has(version.id) &&
      activeLicenseIds.has(version.licenseVersionId)
      ? [{ id: version.id, name: profile.name, version: version.version }]
      : [];
  });
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>サービスの見た目・登録設定</h1>
          <p>
            利用者に見える名前、ロゴ、色、参加方法を設定します。秘密のAPIキーはこの画面では扱いません。
          </p>
        </header>
        <section className="settings-card service-settings-url-card">
          <p className="eyebrow">このサービスの案内先</p>
          <p>
            <strong>専用URL：</strong> /s/{value.slug}
          </p>
          <p>専用URL、公開状態、利用期間、「Powered by」の表示はシステム管理者が管理します。</p>
        </section>
        <section className="settings-card service-settings-card">
          <ServiceSettingsEditor
            serviceSlug={value.slug}
            value={value}
            visualCharacters={visualCharacters}
            audioTracks={audioTracks}
          />
        </section>
        <a href={`/s/${value.slug}/home`}>サービスホームへ戻る</a>
      </main>
    </PublicShell>
  );
}
