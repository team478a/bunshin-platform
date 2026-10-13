export function ServiceAuthBranding({
  serviceName,
  logoUrl,
  poweredBy,
}: {
  serviceName: string;
  logoUrl: string | null;
  poweredBy: boolean;
}) {
  return (
    <header className="service-auth-brand" aria-label={`${serviceName}のログイン`}>
      {logoUrl ? (
        <div
          className="service-auth-brand__logo"
          role="img"
          aria-label={`${serviceName}のロゴ`}
          style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
        />
      ) : (
        <p className="service-auth-brand__name">{serviceName}</p>
      )}
      {poweredBy && <small>ワタシワークスを利用しています</small>}
    </header>
  );
}
