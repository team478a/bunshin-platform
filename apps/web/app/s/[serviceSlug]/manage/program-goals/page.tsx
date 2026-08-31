import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ProgramGoalsAdminEditor } from './program-goals-admin-editor';

export const dynamic = 'force-dynamic';

export default async function ProgramGoalsAdminPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/program-goals`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const [programs, policies, definitions] = await Promise.all([
    db.prisma.serviceProgram.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId, status: 'ACTIVE' },
      orderBy: { displayName: 'asc' },
    }),
    db.prisma.serviceProgramSupportPolicy.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId, status: 'ACTIVE' },
    }),
    db.prisma.programGoalDefinition.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId, status: 'ACTIVE' },
      orderBy: [{ serviceProgramId: 'asc' }, { sortOrder: 'asc' }],
    }),
  ]);
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>支援方法と目標候補</h1>
          <p>参加者へ何を渡せるか、どんな目標を選べるかを分かりやすく設定します。</p>
          <a href={`/s/${serviceSlug}/manage/programs`}>← 実践プログラムへ戻る</a>
        </header>
        <ProgramGoalsAdminEditor
          serviceSlug={serviceSlug}
          programs={programs.map((program) => ({
            id: program.id,
            name: program.displayName,
            policy: policies.find((policy) => policy.serviceProgramId === program.id)
              ? {
                  modes: policies.find((policy) => policy.serviceProgramId === program.id)!
                    .allowedSupportModes as string[],
                  guidance: policies.find((policy) => policy.serviceProgramId === program.id)!
                    .guidance,
                }
              : null,
            goals: definitions
              .filter((goal) => goal.serviceProgramId === program.id)
              .map((goal) => ({ id: goal.id, name: goal.name, unit: goal.unit })),
          }))}
        />
      </main>
    </PublicShell>
  );
}
