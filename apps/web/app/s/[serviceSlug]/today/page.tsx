import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { recordFortuneFunnel } from '../../../../src/fortune/funnel';
import { prisma } from '@bunshin/database';
import {
  availableFortuneProduct,
  hasAvailableFortunePurchase,
} from '../../../../src/fortune/commerce';
import {
  fortuneDeepReadingEnabled,
  fortuneIntakeOptions,
  toJapanLocalDate,
} from '@bunshin/capability-fortune';
import { FortuneAppearance } from '../fortune-appearance';
import { PublicShell } from '../../../ui/public-shell';
import { fortuneDailyReadingService } from '../../../../src/fortune/runtime';
import { resolveFortuneGuidanceSettings } from '../../../../src/fortune/guidance-settings';
import { fortuneReferralAvailable } from '../../../../src/fortune/referral-access';
import { resolveFortunePage } from '../../../../src/fortune/page-context';
import { FortuneDrawButtons, FortuneJoinButton } from '../fortune-actions';
import { FortuneNav, ReadingCard } from '../fortune-ui';
import { FortuneReflection } from '../fortune-reflection';
import { FortuneProfileForm } from '../fortune-profile-form';
import { FortuneCharacterBadge } from '../fortune-character';
import { FortuneDynamicIntake } from '../fortune-dynamic-intake';
import {
  fortunePersonalProfileRepository,
  fortuneUnderstandingRepository,
} from '../../../../src/fortune/personal-profile';
import '@fontsource-variable/noto-sans-jp';
import './fortune-today.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '今日の占い' };

export default async function FortuneTodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams?: Promise<{ paid?: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, service, setting } = await resolveFortunePage(
    serviceSlug,
    `/s/${serviceSlug}/today`,
  );
  const readings = await fortuneDailyReadingService();
  const today = await readings.today({ serviceSlug, actorUserId: actor.userId, recordView: true });
  const profile = today.participant
    ? await (
        await fortunePersonalProfileRepository()
      ).read({ serviceSlug, actorUserId: actor.userId })
    : null;
  const guidance = resolveFortuneGuidanceSettings(setting.guidanceSettings);
  const previous =
    profile?.enabled && profile.completed
      ? (await readings.history({ serviceSlug, actorUserId: actor.userId, limit: 7 })).find(
          (reading) =>
            reading.localDate < toJapanLocalDate(new Date()) &&
            ['READY_AI', 'READY_BASIC'].includes(reading.status),
        )
      : null;
  const commerce = serviceSlug === 'watashi-fortune' || Boolean(setting.commerceProduct);
  const scope = { workspaceId: service.workspaceId, groupId: service.serviceId };
  const [hasPurchase, product, opportunity] =
    commerce && today.participant
      ? await Promise.all([
          hasAvailableFortunePurchase(prisma, scope, actor.userId),
          setting.commerceProduct?.enabled
            ? availableFortuneProduct(prisma, scope, actor.userId)
            : null,
          prisma.fortuneProductHypothesis.findFirst({
            where: {
              ...scope,
              OR: [{ published: true }, { interests: { some: { memberUserId: actor.userId } } }],
            },
            select: { id: true },
          }),
        ])
      : [false, null, null];
  if (product && !hasPurchase) await recordFortuneFunnel(serviceSlug, actor.userId, 'PAID_OFFER');
  const paidView =
    hasPurchase &&
    (await searchParams)?.paid === '1' &&
    setting.aiEnabled &&
    setting.personalProfileEnabled &&
    fortuneDeepReadingEnabled(setting.guidanceSettings);
  const canUpgrade = Boolean(
    today.reading &&
    ['READY_BASIC', 'READY_AI'].includes(today.reading.status) &&
    !today.reading.deepReading,
  );
  const showUpgrade = paidView && canUpgrade && profile?.profile.consented;
  const showIntake = Boolean(profile?.enabled && !profile.completed && !today.reading);
  const showGuide = setting.personalProfileEnabled && setting.aiEnabled;
  const showDynamicIntake =
    showGuide &&
    !showIntake &&
    (!commerce || (paidView && profile?.profile.consented)) &&
    fortuneIntakeOptions(setting.guidanceSettings).enabled;
  const DrawButtons = showDynamicIntake ? FortuneDynamicIntake : FortuneDrawButtons;
  const deepEnabled =
    showGuide && (!commerce || paidView) && fortuneDeepReadingEnabled(setting.guidanceSettings);
  const saved =
    deepEnabled && profile?.profile.consented && (!today.reading || canUpgrade)
      ? await (
          await fortuneUnderstandingRepository()
        ).read({ serviceSlug, actorUserId: actor.userId })
      : null;
  const priorUnderstanding =
    saved?.savedAt &&
    saved.items.length &&
    toJapanLocalDate(new Date(saved.savedAt)) < toJapanLocalDate(new Date())
      ? saved.items
      : undefined;
  const nextAction = !today.participant
    ? '年齢確認へ'
    : showIntake
      ? 'はじめる'
      : today.reading
        ? '今日の鑑定を見る'
        : showDynamicIntake
          ? '占い方を選ぶ'
          : '今日のカードを引く';
  const { guide, characters } = guidance;
  const welcome = showIntake || !today.participant ? characters?.intake : characters?.daily;
  const content = (
    <PublicShell showPlatformBrand={false}>
      <div className="app-page fortune-page fortune-today">
        <header className="app-page__heading">
          <h1>今日の占い</h1>
          {fortuneReferralAvailable(service.configuration) && (
            <Link href={`/s/${serviceSlug}/activity` as Route}>友だちに紹介する</Link>
          )}
        </header>
        {(showGuide || welcome?.enabled) && (
          <section className="fortune-today__guide" aria-label="AI案内役">
            {welcome?.enabled ? (
              <FortuneCharacterBadge
                character={welcome}
                expression="welcome"
                {...(guide?.imageUrl ? { fallbackImage: guide.imageUrl } : {})}
              />
            ) : (
              <div className="fortune-today__guide-profile">
                {guide?.imageUrl && (
                  <img
                    src={guide.imageUrl}
                    alt=""
                    width={56}
                    height={56}
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <p className="eyebrow">AI案内役</p>
                  <h2>{guidance.guideName}</h2>
                </div>
              </div>
            )}
            <p>
              {guide?.introduction ||
                '今日のカードから、今のあなたが考えを整理するヒントをお届けします。'}
            </p>
            <a href="#fortune-today-action" className="button button--primary">
              {nextAction}
            </a>
          </section>
        )}
        <div id="fortune-today-action" className="fortune-today__action" tabIndex={-1}>
          {profile && showIntake && (
            <FortuneProfileForm
              serviceSlug={serviceSlug}
              profile={profile.profile}
              initial
              enabled
              guidance={guidance}
            />
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
            <>
              <ReadingCard
                reading={today.reading}
                serviceSlug={serviceSlug}
                showFollowUps={showGuide && (!commerce || Boolean(today.reading.deepReading))}
                showCreditFollowUps={showGuide && setting.followUpCreditEnabled}
                {...(characters ? { characters } : {})}
              />
              {showUpgrade && (
                <section className="settings-card">
                  <h2>今日のカードで深層鑑定を受ける</h2>
                  <p>引いたカードとテーマを使います。今回の相談を確認してから鑑定します。</p>
                  <FortuneDynamicIntake
                    serviceSlug={serviceSlug}
                    summoning={guidance.appearance?.summoning === true}
                    selectedTheme={today.reading.theme}
                    paidReading
                    deepReadingEnabled
                    {...(characters ? { characters } : {})}
                    {...(priorUnderstanding ? { priorUnderstanding } : {})}
                  />
                </section>
              )}
              {paidView && today.reading.deepReading && (
                <p>今日の深層鑑定は提供済みです。未利用の鑑定は明日以降にご利用いただけます。</p>
              )}
            </>
          ) : paidView && !profile?.profile.consented ? null : (
            <section className="settings-card">
              <h2>
                {paidView
                  ? '深層鑑定を始める'
                  : showDynamicIntake
                    ? '今日の占い方を選ぶ'
                    : '何について占いますか？'}
              </h2>
              {!showDynamicIntake && <p>今日いちばん気になるものを選んでください。</p>}
              <DrawButtons
                serviceSlug={serviceSlug}
                summoning={guidance.appearance?.summoning === true}
                {...(deepEnabled ? { deepReadingEnabled: true } : {})}
                {...(paidView ? { paidReading: true } : {})}
                {...(characters ? { characters } : {})}
                {...(priorUnderstanding ? { priorUnderstanding } : {})}
                {...(profile?.enabled ? { themeLabels: guidance.themeLabels } : {})}
                askConsultation={Boolean(
                  !commerce &&
                  setting.aiEnabled &&
                  profile?.enabled &&
                  profile.completed &&
                  !profile.profile.question,
                )}
              />
            </section>
          )}
        </div>
        {paidView && !profile?.profile.consented && (
          <p>
            深層鑑定に使う情報の取り扱いを
            <Link href={`/s/${serviceSlug}/settings` as Route}>個別化設定</Link>で確認してください。
          </p>
        )}
        {commerce && today.participant && (hasPurchase || product || setting.commerceProduct) && (
          <section className="settings-card">
            <h2>深層鑑定</h2>
            <Link href={`/s/${serviceSlug}/fortune-purchase` as Route}>
              {hasPurchase
                ? '購入済みの深層鑑定を確認する'
                : product
                  ? canUpgrade
                    ? '今日のカードを使う深層鑑定の内容と価格を見る'
                    : '提供内容と価格を見る'
                  : '購入履歴を見る'}
            </Link>
          </section>
        )}
        {opportunity && (
          <p>
            <Link href={`/s/${serviceSlug}/fortune-opportunities` as Route}>今後の企画を見る</Link>
          </p>
        )}
        {previous && setting.reflectionEnabled && profile?.profile.consented && (
          <FortuneReflection
            key={previous.id}
            serviceSlug={serviceSlug}
            reading={previous}
            {...(characters?.intake ? { character: characters.intake } : {})}
          />
        )}
        {profile?.enabled && profile.completed && (profile.profile.interest || previous) && (
          <section className="settings-card">
            <h2>あなたの占い</h2>
            {profile.profile.interest && <p>関心テーマ {profile.profile.interest}</p>}
            {previous && (
              <>
                <h3>前回の鑑定</h3>
                <ReadingCard reading={previous} serviceSlug={serviceSlug} linked />
              </>
            )}
          </section>
        )}
        <p className="fortune-note">
          占い結果は判断の参考です。医療・法律・投資などの重要な判断は専門家にご相談ください。
        </p>
        <FortuneNav serviceSlug={serviceSlug} />
      </div>
    </PublicShell>
  );
  return (
    <FortuneAppearance settings={guidance.appearance} brand={service.configuration.brand}>
      {content}
    </FortuneAppearance>
  );
}
