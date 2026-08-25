import { AdvertisingSafetyService } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { EvidenceEditor } from './evidence-editor';

export const dynamic = 'force-dynamic';

export default async function EvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ bunshinId: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const workspaceId = (await searchParams).workspaceId;
  if (!workspaceId) notFound();
  const bunshinId = (await params).bunshinId;
  const db = await import('@bunshin/database');
  const service = new AdvertisingSafetyService(new db.PrismaAdvertisingSafetyRepository());
  try {
    const [bunshin, evidence, reviews, assignment] = await Promise.all([
      db.prisma.bunshin.findFirstOrThrow({
        where: { id: bunshinId, workspaceId, ownerUserId: user.userId },
        select: { id: true, name: true },
      }),
      service.listEvidence({ workspaceId, bunshinId, actorUserId: user.userId }),
      service.listReviews({ workspaceId, bunshinId, actorUserId: user.userId }),
      db.prisma.productPackAssignment.findFirst({
        where: {
          bunshinId,
          status: 'ACTIVE',
          bunshin: { workspaceId, ownerUserId: user.userId },
          productPackVersion: { status: 'PUBLISHED' },
        },
        select: {
          productPackVersionId: true,
          productPack: { select: { name: true } },
          productPackVersion: { select: { version: true } },
        },
      }),
    ]);
    return (
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">{bunshin.name}</p>
          <h1>経験と広告の安全確認</h1>
          <p>「自分が経験したこと」の根拠を登録し、商品紹介文の表記と事実を確認します。</p>
        </header>
        <EvidenceEditor
          workspaceId={workspaceId}
          bunshinId={bunshinId}
          initialEvidence={JSON.parse(JSON.stringify(evidence)) as unknown[]}
          initialReviews={JSON.parse(JSON.stringify(reviews)) as unknown[]}
          assignment={
            assignment
              ? {
                  versionId: assignment.productPackVersionId,
                  label: `${assignment.productPack.name} 第${assignment.productPackVersion.version}版`,
                }
              : null
          }
        />
      </main>
    );
  } catch {
    notFound();
  }
}
