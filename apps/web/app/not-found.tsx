import Link from 'next/link';
import { PublicShell } from './ui/public-shell';

export default function NotFound() {
  return (
    <PublicShell narrow>
      <section className="service-entry__card" aria-labelledby="not-found-title">
        <p className="eyebrow">ページの案内</p>
        <h1 id="not-found-title">お探しのページが見つかりません</h1>
        <p>
          URLが古いか、公開が終了した可能性があります。サービス名やログイン状態を確認して、もう一度お試しください。
        </p>
        <Link className="button button--primary button--full" href="/">
          トップへ戻る
        </Link>
        <Link className="service-entry__login-link" href="/login">
          ログイン画面を開く
        </Link>
      </section>
    </PublicShell>
  );
}
