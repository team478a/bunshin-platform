import { programGoalsResponse } from '../../../../../src/http/program-goals';

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  const { serviceSlug } = await context.params;
  return programGoalsResponse(request, serviceSlug);
}
