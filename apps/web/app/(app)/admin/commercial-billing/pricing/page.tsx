import {
  commercialMonthPeriod,
  parseCommercialInteger,
  type MauPricingTier,
} from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { PricingEditor } from './pricing-editor';

export const dynamic = 'force-dynamic';

async function authority() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (admin?.role !== 'SUPER_ADMIN') notFound();
  return { db, actor };
}

async function save(data: FormData) {
  'use server';
  const { db, actor } = await authority();
  const rows = z
    .array(
      z.object({ id: z.string().min(1).max(40), upper: z.string(), price: z.string() }).strict(),
    )
    .min(1)
    .max(100)
    .parse(JSON.parse(z.string().parse(data.get('tiers'))));
  const month = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .parse(data.get('month'));
  await new db.PrismaCommercialPricingAdminService().saveDraft({
    ...(data.get('id')
      ? {
          id: z.string().uuid().parse(data.get('id')),
          expectedRevision: parseCommercialInteger(data.get('revision')),
        }
      : {}),
    actorUserId: actor.userId,
    name: z.string().parse(data.get('name')),
    version: z.string().parse(data.get('version')),
    effectiveFrom: new Date(`${month}-01T00:00:00.000Z`),
    reason: z.string().parse(data.get('reason')),
    acknowledgeDescendingPrices: data.get('descending') === 'on',
    tiers: rows.map((r) => ({
      tierKey: r.id,
      upperLimit: parseCommercialInteger(r.upper),
      priceYen: parseCommercialInteger(r.price),
    })),
  });
  redirect('/admin/commercial-billing/pricing');
}

async function transition(data: FormData) {
  'use server';
  const { db, actor } = await authority();
  if (data.get('confirmed') !== 'on') throw new Error('明示確認が必要です');
  await new db.PrismaCommercialPricingAdminService().transition({
    id: z.string().uuid().parse(data.get('id')),
    expectedRevision: parseCommercialInteger(data.get('revision')),
    action: z.enum(['PUBLISH', 'CANCEL']).parse(data.get('action')),
    actorUserId: actor.userId,
    reason: z.string().parse(data.get('reason')),
  });
  redirect('/admin/commercial-billing/pricing');
}

export default async function PricingPage() {
  const { db } = await authority();
  const schedules = await new db.PrismaCommercialUsageService().listPricingSchedules();
  const month = commercialMonthPeriod(new Date()).key;
  const active = schedules.find(
    (s) => s.status === 'PUBLISHED' && s.effectiveFrom.toISOString().slice(0, 7) <= month,
  );
  const current = active
    ? { version: active.version, tiers: active.tiers as unknown as MauPricingTier[] }
    : {
        version: 'oem-mau-jpy-v1',
        tiers: [
          { tierKey: 'tier-base', upperLimit: 100, priceYen: 19800 },
          { tierKey: 'tier-300', upperLimit: 300, priceYen: 39800 },
          { tierKey: 'tier-500', upperLimit: 500, priceYen: 59800 },
          { tierKey: 'tier-1000', upperLimit: 1000, priceYen: 99800 },
          { tierKey: 'tier-3000', upperLimit: 3000, priceYen: 198000 },
        ],
      };
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <h1>OEM共通料金表</h1>
        <p>税込月額。利用月で料金を選び、確定請求は変更しません。</p>
        <Link href="/admin/commercial-billing">請求管理へ</Link>
      </header>
      <section className="settings-card">
        <h2>新しい下書き</h2>
        <PricingEditor
          initial={{
            name: 'OEM共通料金表',
            version: '',
            effectiveFrom: commercialMonthPeriod(new Date(), 1).key,
            reason: '',
            tiers: current.tiers,
          }}
          current={current}
          action={save}
        />
      </section>
      {schedules.map((schedule) => (
        <section className="settings-card" key={schedule.id}>
          <h2>
            {schedule.name} / {schedule.version}
          </h2>
          <p>
            {schedule.effectiveFrom.toISOString().slice(0, 7)}:{' '}
            {schedule.status === 'PUBLISHED'
              ? schedule.effectiveFrom.toISOString().slice(0, 7) > month
                ? '公開予約'
                : active?.id === schedule.id
                  ? '適用中'
                  : '過去の料金'
              : schedule.status === 'DRAFT'
                ? '下書き'
                : '取消済み'}
          </p>
          <details>
            <summary>操作履歴</summary>
            {schedule.audits.map((audit) => (
              <div key={audit.id}>
                <p>
                  {audit.occurredAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} /{' '}
                  {audit.action} / 操作者: {audit.actorUserId}
                </p>
                <p>{audit.reason}</p>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {JSON.stringify({ before: audit.beforeData, after: audit.afterData }, null, 2)}
                </pre>
              </div>
            ))}
          </details>
          {schedule.status === 'DRAFT' && (
            <PricingEditor
              initial={{
                id: schedule.id,
                revision: schedule.revision,
                name: schedule.name,
                version: schedule.version,
                effectiveFrom: schedule.effectiveFrom.toISOString().slice(0, 7),
                reason: schedule.changeReason,
                tiers: schedule.tiers as unknown as MauPricingTier[],
              }}
              current={current}
              action={save}
            />
          )}
          {schedule.status !== 'DRAFT' && (
            <dl>
              {(schedule.tiers as unknown as MauPricingTier[]).map((tier, i, tiers) => (
                <div key={tier.tierKey}>
                  <dt>
                    {i === 0 ? 0 : tiers[i - 1]!.upperLimit + 1}〜{tier.upperLimit}人
                  </dt>
                  <dd>{tier.priceYen.toLocaleString('ja-JP')}円（税込）</dd>
                </div>
              ))}
              <dt>変更理由</dt>
              <dd>{schedule.changeReason}</dd>
            </dl>
          )}
          {(schedule.status === 'DRAFT' ||
            (schedule.status === 'PUBLISHED' &&
              schedule.effectiveFrom.toISOString().slice(0, 7) > month)) && (
            <form action={transition} className="form-stack">
              <input type="hidden" name="id" value={schedule.id} />
              <input type="hidden" name="revision" value={schedule.revision} />
              <input
                type="hidden"
                name="action"
                value={schedule.status === 'DRAFT' ? 'PUBLISH' : 'CANCEL'}
              />
              <label>
                操作理由
                <input name="reason" required maxLength={1000} />
              </label>
              <label>
                <input name="confirmed" type="checkbox" required />
                適用月・段階・税込金額を確認しました
              </label>
              <button className="button">
                {schedule.status === 'DRAFT' ? '将来月へ公開予約' : '開始前の予約を取消'}
              </button>
            </form>
          )}
        </section>
      ))}
    </main>
  );
}
