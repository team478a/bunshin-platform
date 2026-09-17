const SERVICE_PATH = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/;

export function legalLinksForPathname(pathname: string) {
  const serviceSlug = SERVICE_PATH.exec(pathname)?.[1] ?? null;
  const base = serviceSlug ? `/s/${serviceSlug}` : '';
  return {
    terms: `${base}/terms`,
    privacy: `${base}/privacy`,
  };
}
