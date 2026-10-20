export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const { opsMorningDigestCronResponse } =
    await import('../../../../../src/http/ops-morning-digest');
  return opsMorningDigestCronResponse(request);
}
