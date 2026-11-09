export function ServiceNotFoundCard({ serviceSlug }: { serviceSlug: string }) {
  const serviceHome = `/s/${encodeURIComponent(serviceSlug)}/home`;
  const login = `/login?returnTo=${encodeURIComponent(serviceHome)}`;

  return (
    <section className="service-entry__card" aria-labelledby="service-not-found-title">
      <p className="eyebrow">サービスページの案内</p>
      <h1 id="service-not-found-title">お探しのページが見つかりません</h1>
      <p>
        URLが古いか、利用できる画面が変わった可能性があります。サービスホームから、もう一度お試しください。
      </p>
      <a className="button button--primary button--full" href={serviceHome}>
        サービスホームへ戻る
      </a>
      <a className="service-entry__login-link" href={login}>
        このサービスのログイン画面を開く
      </a>
    </section>
  );
}
