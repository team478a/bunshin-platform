import { updateServiceStaffRoleResponse } from '../../../../../../src/http/service-staff-roles';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; membershipId: string }> },
) {
  const value = await params;
  return updateServiceStaffRoleResponse(request, value.serviceSlug, value.membershipId);
}
