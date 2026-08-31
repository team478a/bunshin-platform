import { enrollProgramResponse } from '../../../../../../../src/http/programs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; serviceProgramId: string }> },
) {
  const value = await params;
  return enrollProgramResponse(request, value.serviceSlug, value.serviceProgramId);
}
