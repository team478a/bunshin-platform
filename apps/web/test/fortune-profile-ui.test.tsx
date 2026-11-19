import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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
