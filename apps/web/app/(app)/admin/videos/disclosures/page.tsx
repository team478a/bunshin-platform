import {
  ActivateVideoDisclosurePolicy,
  CreateVideoDisclosurePolicyDraft,
  ListVideoDisclosurePolicies,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';

export const dynamic = 'force-dynamic';

const platformSchema = z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE_SHORTS']);
const draftSchema = z.object({
  platform: platformSchema,
  disclosureText: z.string().trim().min(3).max(500),
  hashtags: z.string().max(600),
  guidance: z.string().trim().min(3).max(1000),
  changeReason: z.string().trim().min(3).max(1000),
});
const activateSchema = z.object({
  policyId: z.uuid(),
  activationReason: z.string().trim().min(3).max(1000),
});

const labels = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'TikTok',
  YOUTUBE_SHORTS: 'YouTube ショート',
} as const;
const statuses: Record<string, string> = {
  DRAFT: '確認待ち',
  ACTIVE: '使用中',
  SUPERSEDED: '過去の版',
};

async function requireSuperAdmin() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (admin?.role !== 'SUPER_ADMIN') notFound();
  return { actor, db };
}

async function createDraft(formData: FormData) {
  'use server';
  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/admin/videos/disclosures?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new CreateVideoDisclosurePolicyDraft(
      new db.PrismaVideoDisclosurePolicyRepository(),
    ).execute({
      environment: currentLineEnvironment(),
      platform: parsed.data.platform,
      disclosureText: parsed.data.disclosureText,
      hashtags: parsed.data.hashtags
        .split(/[\s,、]+/u)
        .map((value) => value.trim())
        .filter(Boolean),
      guidance: parsed.data.guidance,
      outputMetadata: {
        'watashiworks.ai.assisted': 'true',
        'watashiworks.ai.video_generated': 'false',
      },
      changeReason: parsed.data.changeReason,
      actorUserId: actor.userId,
    });
  } catch {
    redirect('/admin/videos/disclosures?error=save');
  }
  revalidatePath('/admin/videos/disclosures');
  redirect('/admin/videos/disclosures?saved=1');
}

async function activate(formData: FormData) {
  'use server';
  const parsed = activateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/admin/videos/disclosures?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    const activated = await new ActivateVideoDisclosurePolicy(
      new db.PrismaVideoDisclosurePolicyRepository(),
    ).execute({
      ...parsed.data,
      environment: currentLineEnvironment(),
      actorUserId: actor.userId,
    });
    if (!activated) throw new ApplicationError('NOT_FOUND', 'draft not found');
  } catch {
    redirect('/admin/videos/disclosures?error=activate');
  }
  revalidatePath('/admin/videos/disclosures');
  redirect('/admin/videos/disclosures?activated=1');
}

export default async function VideoDisclosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; activated?: string; error?: string }>;
}) {
  const { db } = await requireSuperAdmin();
  const environment = currentLineEnvironment();
  const policies = await new ListVideoDisclosurePolicies(
    new db.PrismaVideoDisclosurePolicyRepository(),
  ).execute(environment);
  const query = await searchParams;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>動画のAI利用表示</h1>
        <p>投稿時に利用者へ案内する文章を、SNSごとに版として管理します。</p>
      </header>
      {query.saved ? (
        <p className="notice notice--success">新しい確認待ちの版を保存しました。</p>
      ) : null}
      {query.activated ? (
        <p className="notice notice--success">選んだ版を使用中にしました。</p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger">
          保存できませんでした。入力内容と権限を確認してください。
        </p>
      ) : null}
      <section className="settings-card">
        <h2>現在の対象</h2>
        <p>
          <strong>{environment}</strong>
        </p>
        <p>この環境の設定だけを使用します。別の環境や別のSNSの設定は使いません。</p>
      </section>
      <section className="settings-card">
        <h2>新しい版を準備する</h2>
        <p>
          保存しただけでは利用者へ反映されません。内容を確認後、「この版を使用する」を押します。
        </p>
        <form action={createDraft} className="form-stack">
          <label className="field">
            <span className="field__label">対象のSNS</span>
            <select className="field__control" name="platform" required>
              {Object.entries(labels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">投稿へ入れるAI利用の説明</span>
            <textarea
              className="field__control"
              name="disclosureText"
              defaultValue="AIを使って台本と素材候補を作成しました。"
              required
            />
          </label>
          <label className="field">
            <span className="field__label">おすすめのハッシュタグ（空白またはカンマ区切り）</span>
            <input className="field__control" name="hashtags" defaultValue="#AI活用" />
          </label>
          <label className="field">
            <span className="field__label">利用者への確認案内</span>
            <textarea
              className="field__control"
              name="guidance"
              defaultValue="投稿前に、各SNSのAI生成コンテンツ表示を確認してください。"
              required
            />
          </label>
          <label className="field">
            <span className="field__label">変更した理由</span>
            <textarea
              className="field__control"
              name="changeReason"
              placeholder="例：SNSの表示ルール変更に対応するため"
              required
            />
          </label>
          <button className="button button--primary" type="submit">
            確認待ちの版を保存する
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>保存した版</h2>
        {policies.length === 0 ? (
          <p>まだ設定がありません。動画を作る前に、各SNSの版を準備して使用中にしてください。</p>
        ) : (
          <ul className="settings-status-list">
            {policies.map((policy) => (
              <li className="settings-status-item" key={policy.id}>
                <h3>
                  {labels[policy.platform]}・第{policy.version}版
                </h3>
                <p>
                  状態：<strong>{statuses[policy.status] ?? policy.status}</strong>
                </p>
                <p>表示文：{policy.disclosureText}</p>
                <p>ハッシュタグ：{policy.hashtags.join(' ') || 'なし'}</p>
                <p>案内：{policy.guidance}</p>
                <p>変更理由：{policy.changeReason}</p>
                {policy.status === 'DRAFT' ? (
                  <form action={activate} className="form-stack">
                    <input type="hidden" name="policyId" value={policy.id} />
                    <label className="field">
                      <span className="field__label">使用を始める理由</span>
                      <input
                        className="field__control"
                        name="activationReason"
                        placeholder="例：内容を確認し、本番利用を開始するため"
                        required
                      />
                    </label>
                    <button className="button button--primary" type="submit">
                      この版を使用する
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
