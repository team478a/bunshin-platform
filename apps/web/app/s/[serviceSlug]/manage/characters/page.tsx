import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { CharacterAdminEditor } from './character-admin-editor';
export const dynamic = 'force-dynamic';
export default async function CharactersPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/characters`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const [profiles, licenses, versions] = await Promise.all([
    db.prisma.aiCharacterProfile.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        scope: 'SERVICE',
        status: { not: 'RETIRED' },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.prisma.aiCharacterLicenseVersion.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      orderBy: { version: 'desc' },
    }),
    db.prisma.aiCharacterProfileVersion.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId, status: 'PUBLISHED' },
    }),
  ]);
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>AIキャラクター</h1>
          <p>見た目、使い方の権利、生成時の指示を順番に登録します。</p>
          <a href={`/s/${serviceSlug}/home`}>← サービスのホームへ戻る</a>
        </header>
        <CharacterAdminEditor
          serviceSlug={serviceSlug}
          profiles={profiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
            description: profile.description,
            status: profile.status,
            licenses: licenses
              .filter((item) => item.characterProfileId === profile.id)
              .map((item) => ({
                id: item.id,
                version: item.version,
                rightsHolder: item.rightsHolder,
              })),
            publishedVersion:
              versions.find((item) => item.characterProfileId === profile.id)?.version ?? null,
          }))}
        />
      </main>
    </PublicShell>
  );
}
