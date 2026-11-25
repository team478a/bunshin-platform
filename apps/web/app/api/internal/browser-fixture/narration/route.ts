export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { browserMaterialNarrationResponse } =
    await import('../../../../../src/http/browser-material-narration');
  return browserMaterialNarrationResponse(request);
}
