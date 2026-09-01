import {
  normalizeServiceReferralAttribution,
  normalizeServiceReferralCode,
} from '@bunshin/application';
import { NextResponse } from 'next/server';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeServiceReferralCode(rawCode);
    const requestUrl = new URL(request.url);
    const attribution = normalizeServiceReferralAttribution({
      source: requestUrl.searchParams.get('source'),
      campaignKey: requestUrl.searchParams.get('campaign'),
      contentKey: requestUrl.searchParams.get('content'),
      landingVariant: requestUrl.searchParams.get('variant'),
    });
    const now = new Date();
    const db = await import('@bunshin/database');
    const landing = await db.prisma.$transaction(async (tx) => {
      const referralCode = await tx.serviceReferralCode.findFirst({
        where: {
          code,
          status: 'ACTIVE',
          groupMembership: { status: 'ACTIVE' },
          group: {
            status: 'ACTIVE',
            serviceConfiguration: {
              is: {
                visibility: 'PUBLIC',
                registration: { is: { referralEnabled: true } },
                AND: [
                  { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                  { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
                ],
              },
            },
          },
        },
        select: {
          workspaceId: true,
          groupId: true,
          id: true,
          group: { select: { serviceConfiguration: { select: { slug: true } } } },
        },
      });
      const slug = referralCode?.group.serviceConfiguration?.slug;
      if (!referralCode || !slug) return null;
      const click = await tx.serviceReferralClick.create({
        data: {
          workspaceId: referralCode.workspaceId,
          groupId: referralCode.groupId,
          referralCodeId: referralCode.id,
          ...attribution,
          expiresAt: new Date(now.getTime() + THIRTY_DAYS_MS),
        },
        select: { id: true },
      });
      return { code, clickId: click.id, slug };
    });
    if (!landing) return new Response('Not Found', { status: 404 });
    const destination = new URL(`/s/${landing.slug}`, request.url);
    destination.searchParams.set('ref', landing.code);
    destination.searchParams.set('rc', landing.clickId);
    return NextResponse.redirect(destination, 303);
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}
