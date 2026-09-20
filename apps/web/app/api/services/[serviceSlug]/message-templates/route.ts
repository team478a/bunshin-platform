import {
  archiveServiceMessageTemplateResponse,
  listServiceMessageTemplatesResponse,
  saveServiceMessageTemplateResponse,
} from '../../../../../src/http/service-message-templates';

export async function GET(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  return listServiceMessageTemplatesResponse(request, (await context.params).serviceSlug);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  return saveServiceMessageTemplateResponse(request, (await context.params).serviceSlug);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  return saveServiceMessageTemplateResponse(request, (await context.params).serviceSlug);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  return archiveServiceMessageTemplateResponse(request, (await context.params).serviceSlug);
}
