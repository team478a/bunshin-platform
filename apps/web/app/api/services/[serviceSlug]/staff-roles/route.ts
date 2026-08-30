import { listServiceStaffRolesResponse } from '../../../../../src/http/service-staff-roles';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return listServiceStaffRolesResponse(request, (await params).serviceSlug);
}
