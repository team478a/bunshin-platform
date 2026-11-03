import {
  disconnectInstagramConnection,
  instagramConnectionErrorResponse,
} from '../../../../../../../../../src/http/instagram-connections';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {
  params: Promise<{ serviceSlug: string; bunshinId: string; connectionId: string }>;
};
export async function POST(request: Request, context: Context) {
  const p = await context.params;
  try {
    return await disconnectInstagramConnection(request, p.serviceSlug, p.bunshinId, p.connectionId);
  } catch (error) {
    return instagramConnectionErrorResponse(error);
  }
}
