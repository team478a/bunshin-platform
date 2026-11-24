export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { browserFixtureSelectionResponse } =
    await import('../../../../../src/http/browser-fixture-selection');
  return browserFixtureSelectionResponse(request);
}
