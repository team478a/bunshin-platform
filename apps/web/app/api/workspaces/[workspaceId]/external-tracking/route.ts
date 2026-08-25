import { listExternalTrackingConfigurationResponse } from '../../../../../src/http/external-tracking-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  return listExternalTrackingConfigurationResponse(request, (await context.params).workspaceId);
}
