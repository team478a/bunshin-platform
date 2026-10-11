import 'server-only';
import { dateInBusinessTimezone } from '@bunshin/application';
import type { PrismaOemBillingAdminService } from '@bunshin/database';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { csv } from './admin-report-export';

export const OEM_OFFERING_POLICY_EXPORT_LIMIT = 10_000;

const productKey = z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/);
const state = z.enum(['ALL', 'NEEDS_MIGRATION', 'CURRENT']);
const scope = z.enum(['current', 'history']);

function exportQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => !['scope', 'q', 'product', 'state'].includes(key)))
    throw new ApplicationError('VALIDATION_ERROR', 'unknown export filter');
  const parsed = z
    .object({
      scope,
      q: z.string().trim().max(120).optional(),
      product: productKey.optional(),
      state: state.default('ALL'),
    })
    .safeParse({
      scope: params.get('scope') ?? undefined,
      q: params.get('q') || undefined,
      product: params.get('product') || undefined,
      state: params.get('state') || undefined,
    });
  if (!parsed.success || (parsed.data.scope === 'history' && params.has('state')))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid export filter');
  return parsed.data;
}

type CurrentOffering = Awaited<
  ReturnType<InstanceType<typeof PrismaOemBillingAdminService>['listOfferingPolicyMigrations']>
>[number];

type OfferingHistory = Awaited<
  ReturnType<InstanceType<typeof PrismaOemBillingAdminService>['listOfferingPolicyHistory']>
>['entries'];

function effectiveNewerPolicies(offering: CurrentOffering, today: string) {
  return offering.product.policyVersions.filter(
    (policy) =>
      offering.product.status === 'ACTIVE' &&
      policy.version > offering.productPolicyVersion.version &&
      policy.effectiveFrom.toISOString().slice(0, 10) <= today,
  );
}

export function currentOfferingPolicyCsvRows(offerings: CurrentOffering[], today: string) {
  return [
    [
      'Organization',
      'Service',
      'Service slug',
      '商品名',
      '商品キー',
      '分類',
      '現在版',
      '適用可能な最新版',
      '移行要否',
      '開始日時',
      '操作者ID',
      '理由',
      'Offering ID',
      'Workspace ID',
      'Group ID',
    ],
    ...offerings.map((offering) => {
      const targets = effectiveNewerPolicies(offering, today);
      const latest = targets.at(-1);
      return [
        offering.group.workspace.name,
        offering.group.serviceConfiguration?.displayName ?? offering.group.name,
        offering.group.serviceConfiguration?.slug ?? null,
        offering.product.displayName,
        offering.productPolicy,
        offering.classification,
        offering.productPolicyVersion.version,
        latest?.version ?? offering.productPolicyVersion.version,
        latest ? '要レビュー' : '現時点で不要',
        offering.startsAt.toISOString(),
        offering.actorUserId,
        offering.reason,
        offering.id,
        offering.workspaceId,
        offering.groupId,
      ];
    }),
  ];
}

export function offeringPolicyHistoryCsvRows(periods: OfferingHistory) {
  return [
    [
      'Organization',
      'Service',
      'Service slug',
      '商品名',
      '商品キー',
      '版',
      '分類',
      '開始日時',
      '終了日時',
      '操作者',
      '操作者ID',
      '理由',
      'Offering ID',
      'Workspace ID',
      'Group ID',
    ],
    ...periods.map((period) => [
      period.group.workspace.name,
      period.group.serviceConfiguration?.displayName ?? period.group.name,
      period.group.serviceConfiguration?.slug ?? null,
      period.product.displayName,
      period.productPolicy,
      period.productPolicyVersion.version,
      period.classification,
      period.startsAt.toISOString(),
      period.endsAt?.toISOString() ?? null,
      period.actorDisplayName,
      period.actorUserId,
      period.reason,
      period.id,
      period.workspaceId,
      period.groupId,
    ]),
  ];
}

function limitExceeded(requestId: string) {
  return Response.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        reason: 'EXPORT_LIMIT_EXCEEDED',
        message: '対象が10,000件を超えています。検索条件を追加して再度保存してください。',
        requestId,
      },
    },
    { status: 413, headers: { 'cache-control': 'private, no-store' } },
  );
}

export async function oemOfferingPolicyExportResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const query = exportQuery(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const db = await import('@bunshin/database');
    const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
      actor.userId,
    );
    if (admin?.role !== 'SUPER_ADMIN')
      throw new ApplicationError('FORBIDDEN', 'super admin required');
    const service = new db.PrismaOemBillingAdminService();
    const filter = {
      ...(query.q ? { query: query.q } : {}),
      ...(query.product ? { productKey: query.product } : {}),
    };
    let rows: Array<Array<string | number | null>>;
    if (query.scope === 'current') {
      const candidates = await service.listOfferingPolicyMigrations(
        actor.userId,
        filter,
        OEM_OFFERING_POLICY_EXPORT_LIMIT + 1,
      );
      if (candidates.length > OEM_OFFERING_POLICY_EXPORT_LIMIT) return limitExceeded(requestId);
      const today = dateInBusinessTimezone(new Date());
      const filtered = candidates.filter((offering) => {
        const needsMigration = effectiveNewerPolicies(offering, today).length > 0;
        if (query.state === 'NEEDS_MIGRATION') return needsMigration;
        if (query.state === 'CURRENT') return !needsMigration;
        return true;
      });
      rows = currentOfferingPolicyCsvRows(filtered, today);
    } else {
      const history = await service.listOfferingPolicyHistory(
        actor.userId,
        filter,
        OEM_OFFERING_POLICY_EXPORT_LIMIT,
      );
      if (history.truncated) return limitExceeded(requestId);
      rows = offeringPolicyHistoryCsvRows(history.entries);
    }
    return new Response(csv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="oem-offering-policy-${query.scope}.csv"`,
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
