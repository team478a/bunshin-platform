import { ListProductionGateEvidence } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { notFound } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { ProductionGateEvidenceEditor } from './evidence-editor';

export const dynamic = 'force-dynamic';

export default async function ProductionGateEvidencePage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  const environment = getServerEnvironment();
  const commitSha = process.env['VERCEL_GIT_COMMIT_SHA']?.toLowerCase() ?? '';
  if (!user || environment.APP_ENV !== 'production' || !/^[0-9a-f]{40}$/.test(commitSha))
    notFound();
  const db = await import('@bunshin/database');
  const evidence = await new ListProductionGateEvidence(
    new db.PrismaProductionGateEvidenceRepository(),
  ).execute({ actorUserId: user.userId, environment: 'PRODUCTION', commitSha });
  return (
    <main className="app-page">
      <p className="eyebrow">運用管理</p>
      <h1>本番開始の確認記録</h1>
      <p>
        実際に確認した項目だけを記録してください。最終承認は、それ以外の確認がすべて有効な場合だけ保存できます。
      </p>
      <ProductionGateEvidenceEditor
        commitSha={commitSha}
        initialEvidence={evidence.map((item) => ({
          ...item,
          occurredAt: item.occurredAt.toISOString(),
        }))}
      />
    </main>
  );
}
