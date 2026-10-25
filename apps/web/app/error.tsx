'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { PublicShell } from './ui/public-shell';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PublicShell narrow>
      <section className="service-entry__card" aria-labelledby="error-title">
        <p className="eyebrow">一時的なエラー</p>
        <h1 id="error-title">ページを表示できませんでした</h1>
        <p>一時的な問題が発生しました。時間をおいて、もう一度お試しください。</p>
        <button className="button button--primary button--full" type="button" onClick={reset}>
          もう一度読み込む
        </button>
        <Link className="service-entry__login-link" href="/">
          トップへ戻る
        </Link>
      </section>
    </PublicShell>
  );
}
