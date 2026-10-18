import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { resolvePersonalLearningRequestActor } from '../../../../../../src/services/personal-learning-request-access';
import { PrismaPersonalLearningSavedExamplesRepository, prisma } from '@bunshin/database';
import { PersonalLearningSavedExamples } from './saved-examples';

export const dynamic = 'force-dynamic';

export default async function PersonalLearningExamplesPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
}) {
  const { serviceSlug, programEnrollmentId } = await params;
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/programs/${programEnrollmentId}/examples`)}`,
    );
  try {
    const actor = await resolvePersonalLearningRequestActor(
      serviceSlug,
      programEnrollmentId,
      user.userId,
      'multiTopic',
      undefined,
      { allowUnselectedTopic: true },
    );
    const items = await new PrismaPersonalLearningSavedExamplesRepository(prisma).list(actor.scope);
    return (
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <header className="space-y-2">
          <p className="text-sm text-slate-600">マナベルスタイル</p>
          <h1 className="text-2xl font-bold">保存した活用例・手本</h1>
          <p>
            あとで見返したい文章や手順を保存できます。自分で削除するか、保存期限を迎えるまで本人だけが見られます。
          </p>
        </header>
        <PersonalLearningSavedExamples
          serviceSlug={serviceSlug}
          enrollmentId={programEnrollmentId}
          initialItems={items.map((item) => ({
            id: item.id,
            title: item.title,
            content: item.content,
            createdAt: item.createdAt.toISOString(),
          }))}
        />
        <p>
          <Link href={`/s/${serviceSlug}/programs/${programEnrollmentId}`}>研修ホームへ戻る</Link>
        </p>
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      redirect(`/s/${serviceSlug}/home`);
    throw error;
  }
}
