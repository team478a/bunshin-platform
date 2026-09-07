const creatomateCdnHost = 'cdn.creatomate.com';
const creatomateBackblazeHost = /^f\d{3}\.backblazeb2\.com$/;
const creatomateBackblazePath = /^\/file\/creatomate-[a-z0-9-]+\/[a-z0-9-]+\.mp4$/i;

export function isAllowedCreatomateOutputUrl(url: URL) {
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
  if (url.hostname === creatomateCdnHost) return url.pathname.toLowerCase().endsWith('.mp4');
  return creatomateBackblazeHost.test(url.hostname) && creatomateBackblazePath.test(url.pathname);
}
