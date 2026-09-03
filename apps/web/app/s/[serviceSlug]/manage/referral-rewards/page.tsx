import { notFound, redirect } from 'next/navigation';
import { ServiceReferralRewardRuleService } from '@bunshin/application';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ReferralRewardRuleEditor } from './referral-reward-rule-editor';

export const dynamic = 'force-dynamic';

export default async function ServiceReferralRewardsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/referral-rewards`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const rules = await new ServiceReferralRewardRuleService(
    new db.PrismaServiceReferralRewardRuleRepository(),
  ).listCurrent({ workspaceId: service.workspaceId, groupId: service.serviceId });
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>紹介特典</h1>
          <p>紹介で参加した人が行動した時に、画像作成に使える回数を渡す条件を設定します。</p>
          <a href={`/s/${serviceSlug}/manage`}>← 管理メニューへ戻る</a>
        </header>
        <section className="settings-card">
          <p>
            特典は、紹介された人が「初期設定を完了」または「最初の投稿を報告」した時だけ渡されます。
            参加登録だけでは渡されません。
          </p>
          <p>特典を止めても、すでに渡した回数は変わりません。</p>
        </section>
        <ReferralRewardRuleEditor
          serviceSlug={serviceSlug}
          rules={rules.map((rule) => ({
            ...rule,
            createdAt: rule.createdAt.toISOString(),
            expiresAfterDays: rule.expiresAfterDays ?? null,
            monthlyGrantLimit: rule.monthlyGrantLimit ?? null,
          }))}
        />
      </main>
    </PublicShell>
  );
}
