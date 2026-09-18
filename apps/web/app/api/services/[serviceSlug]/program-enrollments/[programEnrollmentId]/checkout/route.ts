import { createProgramCheckoutResponse } from '../../../../../../../src/http/program-checkout';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> };

export async function POST(request: Request, context: Context) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return createProgramCheckoutResponse(request, serviceSlug, programEnrollmentId);
}
