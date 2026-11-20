import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { FortunePersonalProfile, FortuneReadingView } from '@bunshin/capability-fortune';
import {
  FortuneDrawButtons,
  FortuneJoinButton,
} from '../../../apps/web/app/s/[serviceSlug]/fortune-actions';
import { FortuneProfileForm } from '../../../apps/web/app/s/[serviceSlug]/fortune-profile-form';
import { FortuneDynamicIntake } from '../../../apps/web/app/s/[serviceSlug]/fortune-dynamic-intake';
import { FortuneReflection } from '../../../apps/web/app/s/[serviceSlug]/fortune-reflection';
import { ReadingCard } from '../../../apps/web/app/s/[serviceSlug]/fortune-ui';
import '../../../apps/web/app/styles.css';

type SerializedReading = Omit<FortuneReadingView, 'createdAt'> & { createdAt: string };

export interface FortuneBrowserFixture {
  joined: boolean;
  completed: boolean;
  profile: FortunePersonalProfile;
  reading?: SerializedReading;
  previous?: SerializedReading;
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
  const DrawButtons = new URLSearchParams(window.location.search).has('dynamic-intake')
    ? FortuneDynamicIntake
    : FortuneDrawButtons;
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
