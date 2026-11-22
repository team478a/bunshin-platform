import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@bunshin/database';
import { createLogger } from '@bunshin/observability';
import { requireSameOrigin } from '../../../../../../src/auth/request-security';
import { resolvePublicServiceContext } from '../../../../../../src/services/public-service';
import {
  acquisitionCookieAge,
  acquisitionCookieName,
  fortuneAcquisitionCookie,
  fortuneFunnelSetting,
  optionalAcquisitionTag,
} from '../../../../../../src/fortune/funnel';

const logger = createLogger();
const query = z
  .object({
    source: z.string().max(64).nullable(),
    medium: z.string().max(64).nullable(),
    campaign: z.string().max(64).nullable(),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  try {
    requireSameOrigin(request);
  } catch {
    return new Response(null, { status: 403 });
  }
  const { serviceSlug } = await context.params;
  const input = query.safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response(null, { status: 400 });
  try {
    const service = await resolvePublicServiceContext(serviceSlug);
    const scope = { workspaceId: service.workspaceId, groupId: service.serviceId };
    const setting = await fortuneFunnelSetting(prisma, scope, serviceSlug);
    if (!setting) return new Response(null, { status: 404 });
    const cookieId = await fortuneAcquisitionCookie(serviceSlug);
    const existing = cookieId
      ? await prisma.fortuneAcquisitionVisit.findFirst({
          where: {
            ...scope,
            id: cookieId,
            occurredAt: { gte: new Date(Date.now() - acquisitionCookieAge * 1000) },
          },
          select: { id: true, channel: true, medium: true, campaign: true },
        })
      : null;
    // Record each landing while retaining the first observed channel for attribution.
    const visit = await prisma.fortuneAcquisitionVisit.create({
      data: {
        ...scope,
        serviceSettingId: setting.id,
        channel: optionalAcquisitionTag(input.data.source) ?? 'direct',
        medium: optionalAcquisitionTag(input.data.medium),
        campaign: optionalAcquisitionTag(input.data.campaign),
      },
      select: { id: true },
    });
    const response = new NextResponse(null, { status: 204 });
    if (!existing)
      response.cookies.set(acquisitionCookieName(serviceSlug), visit.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: acquisitionCookieAge,
        path: '/',
      });
    return response;
  } catch {
    logger.warn('fortune landing visit could not be recorded');
    return new Response(null, { status: 204 });
  }
}
