import {
  instagramConnectionErrorResponse,
  startInstagramConnection,
} from '../../../../../../../../src/http/instagram-connections';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };
export async function POST(request: Request, context: Context) {
  const p = await context.params;
  try {
    return await startInstagramConnection(request, p.serviceSlug, p.bunshinId);
  } catch (error) {
    return instagramConnectionErrorResponse(error);
  }
}
