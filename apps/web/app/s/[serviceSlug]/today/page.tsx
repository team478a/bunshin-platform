import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { toJapanLocalDate } from '@bunshin/capability-fortune';
import { PublicShell } from '../../../ui/public-shell';
import { fortuneDailyReadingService } from '../../../../src/fortune/runtime';
import { resolveFortuneGuidanceSettings } from '../../../../src/fortune/guidance-settings';
import { resolveFortunePage } from '../../../../src/fortune/page-context';
import { FortuneDrawButtons, FortuneJoinButton } from '../fortune-actions';
import { FortuneNav, ReadingCard } from '../fortune-ui';
import { FortuneReflection } from '../fortune-reflection';
import { FortuneProfileForm } from '../fortune-profile-form';
import { fortunePersonalProfileRepository } from '../../../../src/fortune/personal-profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '今日の占い' };

export default async function FortuneTodayPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, setting } = await resolveFortunePage(serviceSlug, `/s/${serviceSlug}/today`);
  const today = await (
    await fortuneDailyReadingService()
  ).today({ serviceSlug, actorUserId: actor.userId, recordView: true });
  const profile = today.participant
    ? await (
        await fortunePersonalProfileRepository()
      ).read({ serviceSlug, actorUserId: actor.userId })
    : null;
  const guidance = resolveFortuneGuidanceSettings(setting.guidanceSettings);
  const previous = profile?.enabled
    ? (
        await (
          await fortuneDailyReadingService()
        ).history({ serviceSlug, actorUserId: actor.userId, limit: 7 })
      ).find(
        (reading) =>
          reading.localDate < toJapanLocalDate(new Date()) &&
          ['READY_AI', 'READY_BASIC'].includes(reading.status),
      )
    : null;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page fortune-page">
        <header className="app-page__heading">
          <p className="eyebrow">1日1回</p>
          <h1>今日の占い</h1>
          <p>気になるテーマを1つ選んで、今日のカードを引きます。</p>
          {profile?.enabled && (
            <p>占いは、自己理解のきっかけとして楽しめるエンターテインメントです。</p>
          )}
        </header>
        {profile?.enabled && !profile.completed && !today.reading && (
          <FortuneProfileForm
            serviceSlug={serviceSlug}
            profile={profile.profile}
            initial
            enabled
            guidance={guidance}
          />
        )}
        {previous && setting.reflectionEnabled && profile?.profile.consented && (
          <FortuneReflection key={previous.id} serviceSlug={serviceSlug} reading={previous} />
        )}
        {!today.participant ? (
          <section className="settings-card">
            <h2>最初に年齢を確認します</h2>
            <p>占いは、未来を断定するものではなく、今日を考えるためのヒントです。</p>
            <FortuneJoinButton serviceSlug={serviceSlug} minimumAge={setting.minimumAge} />
          </section>
        ) : today.reading?.status === 'DELETED' ? (
          <section className="settings-card">
            <h2>今日の結果は削除済みです</h2>
            <p>今日は引き直せません。明日になると新しいカードを引けます。</p>
          </section>
        ) : today.reading ? (
          <ReadingCard reading={today.reading} serviceSlug={serviceSlug} />
        ) : (
          <section className="settings-card">
            <h2>何について占いますか？</h2>
            <p>今日いちばん気になるものを選んでください。</p>
            {profile?.enabled && setting.aiEnabled && (
              <p>{guidance.guideName}（AI）が、承認済みのタロット解釈をもとに案内します。</p>
            )}
            <FortuneDrawButtons
              serviceSlug={serviceSlug}
              {...(profile?.enabled ? { themeLabels: guidance.themeLabels } : {})}
              askConsultation={Boolean(
                setting.aiEnabled &&
                profile?.enabled &&
                profile.completed &&
                !profile.profile.question,
              )}
            />
          </section>
        )}
        {profile?.enabled && (
          <section className="settings-card">
            <h2>あなたの占い</h2>
            {profile.profile.interest && <p>関心テーマ {profile.profile.interest}</p>}
            {previous && (
              <>
                <h3>前回の鑑定</h3>
                <ReadingCard reading={previous} serviceSlug={serviceSlug} linked />
              </>
            )}
            <div className="button-row">
              <Link href={`/s/${serviceSlug}/history` as Route}>過去の鑑定を見る</Link>
              <Link href={`/s/${serviceSlug}/settings` as Route}>希望・LINE通知の設定</Link>
            </div>
          </section>
        )}
        <p className="fortune-note">
          占い結果は判断の参考です。医療・法律・投資などの重要な判断は専門家にご相談ください。
        </p>
        <FortuneNav serviceSlug={serviceSlug} />
      </main>
    </PublicShell>
  );
}
