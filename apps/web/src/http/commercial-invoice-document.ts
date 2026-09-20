import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { renderCommercialInvoicePdf } from '../commercial-invoice-document';

const uuid = z.string().uuid();

export async function commercialInvoiceDocumentResponse(
  request: Request,
  rawWorkspaceId: string,
  rawInvoiceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const [workspaceId, invoiceId] = [uuid.parse(rawWorkspaceId), uuid.parse(rawInvoiceId)];
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const db = await import('@bunshin/database');
    const [platformAdmin, membership, invoice] = await Promise.all([
      new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(actor.userId),
      db.prisma.workspaceMembership.findFirst({
        where: {
          workspaceId,
          userId: actor.userId,
          role: { in: ['OWNER', 'ADMIN'] },
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
      db.prisma.tenantInvoice.findFirst({
        where: {
          id: invoiceId,
          workspaceId,
          status: { in: ['ISSUED', 'PAID'] },
          documentSnapshot: { not: db.Prisma.JsonNull },
        },
        select: { id: true, invoiceNumber: true, documentSnapshot: true },
      }),
    ]);
    if ((!platformAdmin && !membership) || !invoice?.documentSnapshot) {
      throw new ApplicationError('NOT_FOUND', 'invoice document unavailable');
    }
    const { pdf } = await renderCommercialInvoicePdf(invoice.documentSnapshot);
    await db.prisma.commercialBillingAudit.create({
      data: {
        workspaceId,
        actorUserId: actor.userId,
        entityType: 'INVOICE',
        entityId: invoice.id,
        action: 'DOCUMENT_DOWNLOADED',
        afterData: { downloadedAt: new Date().toISOString(), invoiceNumber: invoice.invoiceNumber },
      },
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
