export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { accountDeletionOperationsResponse } =
    await import('../../../../../src/http/account-deletion-operations');
  return accountDeletionOperationsResponse(request);
}

export const GET = POST;
