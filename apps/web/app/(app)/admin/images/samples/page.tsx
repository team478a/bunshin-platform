import { notFound } from 'next/navigation';
import { imageSampleScope } from '../../../../../src/http/social-image-samples';
import { ImageSampleWorkspace } from '../../../../ui/image-sample-workspace';
export const dynamic = 'force-dynamic';
export default async function ImageSamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string }>;
}) {
  const { groupId } = await searchParams;
  const scope = groupId ? await imageSampleScope(groupId) : null;
  if (!scope || !groupId) notFound();
  const samples = await scope.db.prisma.socialImageSample.findMany({
    where: { groupId, ownerUserId: scope.actor.userId, status: { not: 'DELETED' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, status: true, layout: true },
  });
  return (
    <main className="app-page">
      <h1>投稿画像の試作</h1>
      <p>{scope.member.group.name}の紹介画像を作り、文字と雰囲気を確認します。</p>
      <p>試作は1日3枚・月10枚まで。一般参加者には公開されません。</p>
      <ImageSampleWorkspace
        groupId={groupId}
        bunshins={scope.bunshins}
        samples={samples.map((s) => ({ id: s.id, status: s.status }))}
      />
      <p>
        <a href="/admin/images">画像生成の設定へ戻る</a>
      </p>
    </main>
  );
}
