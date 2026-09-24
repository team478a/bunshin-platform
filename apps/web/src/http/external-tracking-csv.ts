import 'server-only';
import { validateExternalTrackingUrl } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { requireSameOrigin } from '../auth/request-security';
import {
  EXTERNAL_TRACKING_CSV_MAX_BYTES,
  parseExternalTrackingCsv,
} from '../external-tracking/csv-import';
import {
  externalTrackingResponse as respond,
  externalTrackingService as service,
  externalTrackingUuid as uuid,
} from './external-tracking-http-core';
type ImportConfiguration = {
  systems: Array<{
    id: string;
    status: string;
    allowedDomains: Array<{
      id: string;
      hostname: string;
      allowSubdomains: boolean;
      shortener: boolean;
      status: 'ACTIVE' | 'SUSPENDED';
    }>;
  }>;
  members: Array<{ id: string; consentedAt: Date | string | null; user: { email: string | null } }>;
  products: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
  links: Array<{
    externalLinkId: string | null;
    url: string;
    productPackId: string | null;
    campaignId: string | null;
    memberIdentity: { groupMembershipId: string } | null;
  }>;
};

const dateFromCsv = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()))
    throw new ApplicationError('VALIDATION_ERROR', '日時の書き方が正しくありません。');
  return date;
};

const findCatalogItem = <T extends { id: string; name: string }>(items: T[], value: string) => {
  if (!value) return null;
  const matches = items.filter((item) => item.id === value || item.name === value);
  if (matches.length !== 1)
    throw new ApplicationError('VALIDATION_ERROR', '商品または企画を1件に特定できません。');
  return matches[0]!;
};

export function importExternalTrackingCsvResponse(
  request: Request,
  workspaceId: string,
  serviceId?: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > EXTERNAL_TRACKING_CSV_MAX_BYTES + 100_000)
      throw new ApplicationError('VALIDATION_ERROR', 'CSVは5MB以下にしてください。');
    const form = await request.formData();
    const groupId = uuid.parse(form.get('groupId'));
    if (serviceId && groupId !== serviceId)
      throw new ApplicationError('FORBIDDEN', 'service boundary mismatch');
    const systemId = uuid.parse(form.get('systemId'));
    const allowedDomainId = uuid.parse(form.get('allowedDomainId'));
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0)
      throw new ApplicationError('VALIDATION_ERROR', 'CSVファイルを選んでください。');
    const rows = parseExternalTrackingCsv(new Uint8Array(await file.arrayBuffer()));
    const { scope, value } = await service(workspaceId, serviceId);
    const configuration = (await value.listConfiguration({
      ...scope,
      groupId,
    })) as ImportConfiguration;
    const system = configuration.systems.find(
      (item) => item.id === systemId && item.status === 'ACTIVE',
    );
    const domain = system?.allowedDomains.find(
      (item) => item.id === allowedDomainId && item.status === 'ACTIVE',
    );
    if (!system || !domain)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        '外部サービスまたはドメインを確認してください。',
      );
    const seen = new Set<string>();
    const results: Array<{ rowNumber: number; status: 'IMPORTED' | 'ERROR'; message: string }> = [];
    for (const row of rows) {
      try {
        if (!row.url) throw new ApplicationError('VALIDATION_ERROR', '専用URLがありません。');
        const member = row.participant_id
          ? configuration.members.find((item) => item.id === row.participant_id)
          : row.email
            ? configuration.members.find(
                (item) => item.user.email?.toLowerCase() === row.email.toLowerCase(),
              )
            : null;
        if ((row.participant_id || row.email) && (!member || !member.consentedAt))
          throw new ApplicationError('VALIDATION_ERROR', '利用できる参加者が見つかりません。');
        const product = findCatalogItem(configuration.products, row.product_code);
        const campaign = findCatalogItem(configuration.campaigns, row.campaign_code);
        if (product && campaign)
          throw new ApplicationError('VALIDATION_ERROR', '商品と企画は同時に指定できません。');
        const duplicateKey = [
          member?.id ?? '',
          product?.id ?? '',
          campaign?.id ?? '',
          row.url,
        ].join('|');
        const alreadyExists = configuration.links.some(
          (link) =>
            (row.external_link_id && link.externalLinkId === row.external_link_id) ||
            [
              link.memberIdentity?.groupMembershipId ?? '',
              link.productPackId ?? '',
              link.campaignId ?? '',
              link.url,
            ].join('|') === duplicateKey,
        );
        if (alreadyExists || seen.has(duplicateKey))
          throw new ApplicationError('CONFLICT', '同じ条件の専用URLがすでにあります。');
        const startsAt = dateFromCsv(row.starts_at);
        const expiresAt = dateFromCsv(row.expires_at);
        if (startsAt && expiresAt && startsAt >= expiresAt)
          throw new ApplicationError(
            'VALIDATION_ERROR',
            '開始日時は終了日時より前にしてください。',
          );
        validateExternalTrackingUrl(row.url, domain);
        let memberIdentityId: string | null = null;
        if (member) {
          const identity = (await value.upsertMemberIdentity({
            ...scope,
            systemId,
            groupMembershipId: member.id,
            commonUserId: null,
            agencyId: row.agency_id || null,
            externalMemberId: row.external_member_id || null,
          })) as { id: string };
          memberIdentityId = identity.id;
        }
        const scopeType = member
          ? campaign
            ? 'CAMPAIGN_MEMBER'
            : product
              ? 'PRODUCT_MEMBER'
              : 'MEMBER'
          : campaign
            ? 'CAMPAIGN'
            : product
              ? 'PRODUCT'
              : 'GROUP';
        await value.createLink({
          ...scope,
          systemId,
          allowedDomainId,
          memberIdentityId,
          productPackId: product?.id ?? null,
          campaignId: campaign?.id ?? null,
          scopeType,
          name: row.url_name || `CSV ${row.rowNumber}行目`,
          externalLinkId: row.external_link_id || null,
          referralToken: null,
          url: row.url,
          startsAt,
          expiresAt,
          notes: 'CSV取込',
        });
        seen.add(duplicateKey);
        results.push({
          rowNumber: row.rowNumber,
          status: 'IMPORTED',
          message: '下書きで登録しました。',
        });
      } catch (error) {
        results.push({
          rowNumber: row.rowNumber,
          status: 'ERROR',
          message: error instanceof Error ? error.message : '登録できませんでした。',
        });
      }
    }
    const imported = results.filter((item) => item.status === 'IMPORTED').length;
    return { total: rows.length, imported, failed: rows.length - imported, results };
  });
}
