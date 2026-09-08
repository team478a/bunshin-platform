import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = {
  title: '投稿画像のスマートフォン確認 | ワタシワークス',
  description: 'ワタシワークスで生成する投稿画像のスマートフォン向け確認画面です。',
  robots: { index: false, follow: false },
};

const pages = [1, 2, 3, 4].map((pageNumber) => ({
  pageNumber,
  src: `/image-previews/editorial-carousel/page-${pageNumber}.png`,
}));

export default function EditorialCarouselPreviewPage() {
  return (
    <main className="mobile-image-preview">
      <header className="mobile-image-preview__header">
        <p className="eyebrow">画像プラン・制作見本</p>
        <h1>投稿画像を確認</h1>
        <p>画像を左右にスワイプすると、4枚すべて確認できます。</p>
      </header>

      <ol className="mobile-image-preview__slides" aria-label="投稿画像4枚">
        {pages.map(({ pageNumber, src }) => (
          <li id={`preview-page-${pageNumber}`} key={src}>
            <figure>
              <Image
                src={src}
                alt={`投稿画像の制作見本 ${pageNumber}枚目`}
                width={720}
                height={1280}
                priority={pageNumber === 1}
              />
              <figcaption>
                <span>
                  {pageNumber} / {pages.length}
                </span>
                <a href={src} download={`watashi-works-sample-${pageNumber}.png`}>
                  この画像を保存
                </a>
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>

      <nav className="mobile-image-preview__pagination" aria-label="画像を選ぶ">
        {pages.map(({ pageNumber }) => (
          <a href={`#preview-page-${pageNumber}`} key={pageNumber}>
            <span className="sr-only">{pageNumber}枚目を見る</span>
          </a>
        ))}
      </nav>

      <aside className="mobile-image-preview__help">
        <strong>スマートフォンへの保存方法</strong>
        <p>
          「この画像を保存」を押します。画像だけが開いた場合は、画像を長押しして保存してください。
        </p>
      </aside>
    </main>
  );
}
