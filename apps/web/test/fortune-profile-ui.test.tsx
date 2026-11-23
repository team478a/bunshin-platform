import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FortuneBasicProfileForm } from '../app/s/[serviceSlug]/fortune-basic-profile-form';
import { defaultFortuneBasicProfileSettings } from '../src/fortune/guidance-settings';
import { FortuneProfileForm } from '../app/s/[serviceSlug]/fortune-profile-form';
import { FortuneReflection } from '../app/s/[serviceSlug]/fortune-reflection';
import { emptyFortunePersonalProfile } from '@bunshin/capability-fortune';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('personal fortune UI', () => {
  it('renders three optional questions and a skip action without preselecting consent', () => {
    const markup = renderToStaticMarkup(
      <FortuneProfileForm
        serviceSlug="tarot"
        profile={emptyFortunePersonalProfile}
        enabled
        initial
      />,
    );
    expect(markup).toContain('name="interest"');
    expect(markup).toContain('name="question"');
    expect(markup).toContain('name="style"');
    expect(markup).toContain('スキップ');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('checked=""');
  });

  it('lets the owner remove saved fields after collection is turned off', () => {
    const markup = renderToStaticMarkup(
      <FortuneBasicProfileForm
        serviceSlug="tarot"
        profile={{
          nickname: '月',
          birthDate: '1992-02-29',
          sex: null,
          sexDescription: null,
          consentedAt: '2026-11-23T00:00:00.000Z',
          createdAt: '2026-11-23T00:00:00.000Z',
          updatedAt: '2026-11-23T00:00:00.000Z',
        }}
        settings={defaultFortuneBasicProfileSettings}
        initial={false}
      />,
    );
    expect(markup).toContain('1992-02-29');
    expect(markup).toContain('生年月日を削除');
    expect(markup).toContain('同意を撤回して基本プロフィールを削除');
    expect(markup).not.toContain('type="date"');
    expect(markup).not.toContain('name="consent"');
  });

  it('shows an optional previous reflection without preselecting a response', () => {
    const markup = renderToStaticMarkup(
      <FortuneReflection
        serviceSlug="tarot"
        reading={{
          id: 'reading',
          actionStep: '気づきを書く',
          reflectionPrompt: 'どんな気づきがありましたか？',
        }}
      />,
    );
    expect(markup).toContain('前回の提案を振り返る（任意）');
    expect(markup).toContain('どんな気づきがありましたか？');
    expect(markup).not.toContain('aria-pressed="true"');
  });
});
