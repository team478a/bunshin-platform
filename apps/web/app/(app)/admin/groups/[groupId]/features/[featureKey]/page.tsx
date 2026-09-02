import { GroupFeatureEntitlementService } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const policySchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  featureKey: z.string().trim().min(1).max(120),
  status: z.enum(['ENABLED', 'DISABLED']),
  dailyLimit: z.string().max(20),
  monthlyLimit: z.string().max(20),
  startsAt: z.string().max(40),
  endsAt: z.string().max(40),
  reason: z.string().trim().min(5).max(1000),
});

function optionalLimit(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid limit');
  return parsed;
}

function optionalDate(value: string): Date | null {
  if (value.trim() === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid date');
  return parsed;
}

function detailPath(groupId: string, featureKey: string, suffix = ''): Route {
  return `/admin/groups/${groupId}/features/${featureKey}${suffix}` as Route;
}

function listPath(groupId: string, suffix = ''): Route {
  return `/admin/groups/${groupId}/features${suffix}` as Route;
}

function localDateTime(value: Date | null): string {
  if (!value) return '';
  return value
    .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

async function saveGroupFeaturePolicy(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = policySchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/groups?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new GroupFeatureEntitlementService(
      new db.PrismaGroupFeatureEntitlementRepository(),
    ).setGroupPolicy({
      ...input.data,
      actorUserId: actor.userId,
      dailyLimit: optionalLimit(input.data.dailyLimit),
      monthlyLimit: optionalLimit(input.data.monthlyLimit),
      startsAt: optionalDate(input.data.startsAt),
      endsAt: optionalDate(input.data.endsAt),
    });
  } catch (error) {
    const code =
      error instanceof ApplicationError && error.code === 'FORBIDDEN' ? 'forbidden' : 'failed';
    redirect(detailPath(input.data.groupId, input.data.featureKey, `?error=${code}`));
  }
  revalidatePath(listPath(input.data.groupId));
  revalidatePath(detailPath(input.data.groupId, input.data.featureKey));
  redirect(listPath(input.data.groupId, '?saved=1'));
}

export default async function GroupFeatureSettingPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string; featureKey: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const route = await params;
  const groupId = z.uuid().safeParse(route.groupId);
  const featureKey = z.string().trim().min(1).max(120).safeParse(route.featureKey);
  if (!groupId.success || !featureKey.success) notFound();
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin) notFound();
  const definitions = await new db.PrismaGroupFeatureEntitlementRepository().listDefinitions();
  const definition = definitions.find(
    (item) => item.key === featureKey.data && item.status === 'ACTIVE',
  );
  if (!definition) notFound();
  const group = await db.prisma.group.findUnique({
    where: { id: groupId.data },
    select: {
      id: true,
      workspaceId: true,
      featurePolicies: { where: { featureKey: definition.key } },
    },
  });
  if (!group) notFound();
  const policy = group.featurePolicies[0] ?? null;
  const canChange = admin.role === 'SUPER_ADMIN' || admin.role === 'OPERATOR';
  const query = await searchParams;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">機能の設定</p>
        <h1>{definition.name}</h1>
        <p>{definition.description}</p>
        <Link href={listPath(group.id)}>← 設定一覧へ戻る</Link>
      </header>
      {query.error ? (
        <p className="notice notice--danger" role="alert">
          {query.error === 'forbidden'
            ? 'この設定を変更する権限がありません。'
            : '設定を保存できませんでした。入力内容と変更理由を確認してください。'}
        </p>
      ) : null}
      <section className="settings-card">
        <h2>この機能を利用できるようにする</h2>
        <p>
          {definition.parentKey
            ? 'この機能を使うには、設定一覧に戻り、上の機能も「利用できる」にしてください。'
            : '利用回数に制限を付けない場合は、上限を空欄のままにします。'}
        </p>
        {!canChange ? (
          <p>現在は確認だけできます。変更は最高管理者または運用担当者が行います。</p>
        ) : (
          <form className="form-stack" action={saveGroupFeaturePolicy}>
            <input type="hidden" name="workspaceId" value={group.workspaceId} />
            <input type="hidden" name="groupId" value={group.id} />
            <input type="hidden" name="featureKey" value={definition.key} />
            <label className="field">
              <span className="field__label">このグループで</span>
              <select
                className="field__control"
                name="status"
                defaultValue={policy?.status ?? 'DISABLED'}
              >
                <option value="ENABLED">利用できる</option>
                <option value="DISABLED">利用できない</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">1日の上限（空欄なら上限なし）</span>
              <input
                className="field__control"
                name="dailyLimit"
                type="number"
                min="1"
                max="1000000"
                defaultValue={policy?.dailyLimit ?? ''}
              />
            </label>
            <label className="field">
              <span className="field__label">1か月の上限（空欄なら上限なし）</span>
              <input
                className="field__control"
                name="monthlyLimit"
                type="number"
                min="1"
                max="1000000"
                defaultValue={policy?.monthlyLimit ?? ''}
              />
            </label>
            <label className="field">
              <span className="field__label">利用開始日時（空欄なら今から）</span>
              <input
                className="field__control"
                name="startsAt"
                type="datetime-local"
                defaultValue={localDateTime(policy?.startsAt ?? null)}
              />
            </label>
            <label className="field">
              <span className="field__label">利用終了日時（空欄なら期限なし）</span>
              <input
                className="field__control"
                name="endsAt"
                type="datetime-local"
                defaultValue={localDateTime(policy?.endsAt ?? null)}
              />
            </label>
            <label className="field">
              <span className="field__label">変更理由</span>
              <textarea
                className="field__control"
                name="reason"
                required
                minLength={5}
                maxLength={1000}
                placeholder="例：画像生成テストを開始するため"
              />
            </label>
            <button className="button" type="submit">
              設定を保存して一覧へ戻る
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
