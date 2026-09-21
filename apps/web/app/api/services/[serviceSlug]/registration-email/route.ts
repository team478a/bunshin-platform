import {
  saveServiceRegistrationEmailResponse,
  testServiceRegistrationEmailResponse,
} from '../../../../../src/http/service-registration-email';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  return saveServiceRegistrationEmailResponse(request, (await context.params).serviceSlug);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  return testServiceRegistrationEmailResponse(request, (await context.params).serviceSlug);
}
