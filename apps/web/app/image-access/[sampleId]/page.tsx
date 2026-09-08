import { authorizedImageSampleView } from '../../../src/http/social-image-samples';
import { PublicShell } from '../../ui/public-shell';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: '投稿画像を見る',
  robots: { index: false, follow: false },
  referrer: 'same-origin' as const,
};

export default async function ImageAccessPage({
  params,
}: {
  params: Promise<{ sampleId: string }>;
}) {
  const { sampleId } = await params;
  const sample = await authorizedImageSampleView(sampleId);
  const source = `/image-access/${sampleId}/download`;

  return (
    <PublicShell>
      <main className="app-page" style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
        {sample ? (
          <>
            <h1>投稿画像を確認</h1>
            <p>{sample.groupName} の試作画像です。</p>
            {sample.status === 'READY' ? (
              <>
                <img
                  src={source}
                  alt="試作した投稿画像"
                  style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16 }}
                />
                <p>
                  <a href={source} target="_blank" rel="noreferrer">
                    画像を開く・保存する
                  </a>
                </p>
                <p>スマートフォンでは、画像を長押しするか、共有メニューから保存できます。</p>
              </>
            ) : (
              <p>画像は準備中、または削除されています。</p>
            )}
          </>
        ) : (
          <>
            <h1>投稿画像を見る</h1>
            <p>画像を作成したアカウントでログインすると、スマートフォンで確認・保存できます。</p>
            <a href={`/login?returnTo=${encodeURIComponent(`/image-access/${sampleId}`)}`}>
              作成したアカウントでログインする
            </a>
          </>
        )}
      </main>
    </PublicShell>
  );
}
