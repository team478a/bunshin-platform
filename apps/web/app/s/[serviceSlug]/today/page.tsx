import type { Metadata } from 'next';
import {
  fortuneDeepReadingEnabled,
  fortuneIntakeOptions,
  toJapanLocalDate,
} from '@bunshin/capability-fortune';
import { FortuneAppearance } from '../fortune-appearance';
import { PublicShell } from '../../../ui/public-shell';
import { fortuneDailyReadingService } from '../../../../src/fortune/runtime';
import { resolveFortuneGuidanceSettings } from '../../../../src/fortune/guidance-settings';
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
}: {
  params: Promise<{ serviceSlug: string }>;
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
  const showIntake = Boolean(profile?.enabled && !profile.completed && !today.reading);
  const showGuide = setting.personalProfileEnabled && setting.aiEnabled;
  const showDynamicIntake =
    showGuide && !showIntake && fortuneIntakeOptions(setting.guidanceSettings).enabled;
  const DrawButtons = showDynamicIntake ? FortuneDynamicIntake : FortuneDrawButtons;
  const deepEnabled = showGuide && fortuneDeepReadingEnabled(setting.guidanceSettings);
  const saved =
    deepEnabled && profile?.profile.consented && !today.reading
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
            <ReadingCard
              reading={today.reading}
              serviceSlug={serviceSlug}
              showFollowUps={showGuide}
              {...(characters ? { characters } : {})}
            />
          ) : (
            <section className="settings-card">
              <h2>{showDynamicIntake ? '今日の占い方を選ぶ' : '何について占いますか？'}</h2>
              {!showDynamicIntake && <p>今日いちばん気になるものを選んでください。</p>}
              <DrawButtons
                serviceSlug={serviceSlug}
                {...(deepEnabled ? { deepReadingEnabled: true } : {})}
                {...(characters ? { characters } : {})}
                {...(priorUnderstanding ? { priorUnderstanding } : {})}
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
        </div>
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
