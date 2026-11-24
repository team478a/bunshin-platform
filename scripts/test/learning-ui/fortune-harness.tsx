import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  FortunePersonalProfile,
  FortuneReadingView,
  FortuneUnderstandingSnapshot,
} from '@bunshin/capability-fortune';
import {
  FortuneDrawButtons,
  FortuneJoinButton,
} from '../../../apps/web/app/s/[serviceSlug]/fortune-actions';
import { FortuneProfileForm } from '../../../apps/web/app/s/[serviceSlug]/fortune-profile-form';
import { FortuneDynamicIntake } from '../../../apps/web/app/s/[serviceSlug]/fortune-dynamic-intake';
import { FortuneSavedUnderstanding } from '../../../apps/web/app/s/[serviceSlug]/fortune-understanding';
import { FortuneReflection } from '../../../apps/web/app/s/[serviceSlug]/fortune-reflection';
import { FortuneObservatoryHero } from '../../../apps/web/app/s/[serviceSlug]/today/fortune-observatory-hero';
import { FortuneAppearance } from '../../../apps/web/app/s/[serviceSlug]/fortune-appearance';
import { resolveFortunePageAppearance } from '../../../apps/web/src/fortune/appearance';
import { FortuneNav, ReadingCard } from '../../../apps/web/app/s/[serviceSlug]/fortune-ui';
import { FortuneBasicProfileForm } from '../../../apps/web/app/s/[serviceSlug]/fortune-basic-profile-form';
import { defaultFortuneBasicProfileSettings } from '../../../apps/web/src/fortune/guidance-settings';
import '../../../apps/web/app/styles.css';

type SerializedReading = Omit<FortuneReadingView, 'createdAt'> & { createdAt: string };

export interface FortuneBrowserFixture {
  joined: boolean;
  completed: boolean;
  profile: FortunePersonalProfile;
  reading?: SerializedReading;
  previous?: SerializedReading;
  understanding?: FortuneUnderstandingSnapshot;
}

function FortuneHarness() {
  const [state, setState] = useState<FortuneBrowserFixture>();
  useEffect(() => {
    const refresh = () => {
      void fetch('/__fortune_fixture').then(async (response) =>
        setState((await response.json()) as FortuneBrowserFixture),
      );
    };
    refresh();
    window.addEventListener('fortune-fixture-refresh', refresh);
    return () => window.removeEventListener('fortune-fixture-refresh', refresh);
  }, []);
  if (!state) return null;
  const serviceSlug = 'fixture-fortune';
  const params = new URLSearchParams(window.location.search);
  const illustrated = params.has('observatory');
  if (illustrated || params.has('design'))
    return (
      <FortuneAppearance
        settings={resolveFortunePageAppearance(undefined)}
        brand={undefined}
        showMastheadOrnament={!illustrated}
      >
        <main className="public-shell">
          <div className="public-shell__content">
            <div
              className={`app-page fortune-page fortune-today${illustrated ? ' fortune-today--observatory' : ''}`}
            >
              {illustrated ? (
                <FortuneObservatoryHero />
              ) : (
                <header className="app-page__heading">
                  <h1>今日の占い</h1>
                </header>
              )}
              <section
                className={
                  illustrated
                    ? 'fortune-today__contents'
                    : 'settings-card fortune-today__theme-entry'
                }
              >
                <h2>{illustrated ? '今日のテーマを選ぶ' : '何について占いますか？'}</h2>
                <FortuneDrawButtons serviceSlug={serviceSlug} illustrated={illustrated} />
              </section>
              {illustrated && (
                <a href={`/s/${serviceSlug}/activity`} className="fortune-today__share">
                  友だちに紹介する
                </a>
              )}
              <FortuneNav serviceSlug={serviceSlug} current="today" illustrated={illustrated} />
            </div>
          </div>
        </main>
      </FortuneAppearance>
    );
  if (params.has('basic-profile'))
    return (
      <main className="app-page fortune-page fortune-today">
        <header className="app-page__heading">
          <h1>今日の占い</h1>
        </header>
        <FortuneBasicProfileForm
          serviceSlug={serviceSlug}
          settings={{ ...defaultFortuneBasicProfileSettings, enabled: true }}
        />
        <FortuneNav serviceSlug={serviceSlug} inFlow />
      </main>
    );
  if (state.understanding)
    return (
      <main className="app-page fortune-page">
        <FortuneSavedUnderstanding serviceSlug={serviceSlug} initial={state.understanding} />
      </main>
    );
  const DrawButtons = params.has('dynamic-intake') ? FortuneDynamicIntake : FortuneDrawButtons;
  return (
    <main className="app-page fortune-page">
      <h1>今日の占い</h1>
      {!state.joined ? (
        <FortuneJoinButton serviceSlug={serviceSlug} minimumAge={18} />
      ) : (
        <>
          {!state.completed && (
            <FortuneProfileForm serviceSlug={serviceSlug} profile={state.profile} enabled initial />
          )}
          {state.reading ? (
            <ReadingCard
              reading={{ ...state.reading, createdAt: new Date(state.reading.createdAt) }}
              serviceSlug={serviceSlug}
              showFollowUps
            />
          ) : (
            <DrawButtons serviceSlug={serviceSlug} askConsultation={state.profile.consented} />
          )}
          {state.previous && state.profile.consented && (
            <FortuneReflection serviceSlug={serviceSlug} reading={state.previous} />
          )}
          {state.profile.consented && state.completed && (
            <FortuneProfileForm serviceSlug={serviceSlug} profile={state.profile} enabled />
          )}
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<FortuneHarness />);
