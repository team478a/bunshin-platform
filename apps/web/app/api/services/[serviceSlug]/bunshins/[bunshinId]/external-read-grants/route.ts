import { externalGrantOwnerResponse } from '../../../../../../../src/http/external-read-grant-owner';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };
export async function GET(request: Request, context: Context) {
  const p = await context.params;
  return externalGrantOwnerResponse(request, p.serviceSlug, p.bunshinId);
}
export async function POST(request: Request, context: Context) {
  const p = await context.params;
  return externalGrantOwnerResponse(request, p.serviceSlug, p.bunshinId);
}
export async function DELETE(request: Request, context: Context) {
  const p = await context.params;
  return externalGrantOwnerResponse(request, p.serviceSlug, p.bunshinId);
}
