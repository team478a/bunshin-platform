import { externalReadResponse } from '../../../../../../src/http/external-read';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Context = { params: Promise<{ connectionId: string }> };
export async function POST(request: Request, context: Context) {
  return externalReadResponse(request, (await context.params).connectionId, 'bind');
}
