import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { ProgramAdminEditor } from './program-admin-editor';

export const dynamic = 'force-dynamic';

export default async function ProgramAdminPage() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
    select: { id: true },
  });
  if (!admin) notFound();
  const [workspaces, templates, versions] = await Promise.all([
    db.prisma.workspace.findMany({
      where: { type: 'ORGANIZATION', status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.prisma.programTemplate.findMany({
      where: { visibility: 'PLATFORM' },
      orderBy: { createdAt: 'desc' },
    }),
    db.prisma.programTemplateVersion.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    }),
  ]);
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>公式プログラム</h1>
        <p>複数のサービスで利用できる実践プログラムを準備します。</p>
        <Link href="/admin/services">← サービス管理へ戻る</Link>
      </header>
      {workspaces.length > 0 ? <ProgramAdminEditor workspaces={workspaces} /> : null}
      <section className="settings-card">
        <h2>公開済みの公式プログラム</h2>
        {templates.length === 0 ? <p>まだ公式プログラムはありません。</p> : null}
        <div className="settings-stack">
          {templates.map((template) => {
            const latest = versions.find((version) => version.programTemplateId === template.id);
            return (
              <article key={template.id}>
                <h3>{template.name}</h3>
                <p>{template.description}</p>
                <p>
                  対象：{template.targetAudience} ／ 種類：{template.category}
                </p>
                <p>
                  最新版：第{latest?.version ?? 0}版 ／ 状態：{template.status}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
