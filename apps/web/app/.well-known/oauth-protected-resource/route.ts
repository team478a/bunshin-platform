import { externalAiProtectedResourceMetadata } from '../../../src/http/external-ai-mcp';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(externalAiProtectedResourceMetadata(), {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
