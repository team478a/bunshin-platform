import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyFortunePersonalProfile,
  toJapanLocalDate,
  type FortuneReadingView,
} from '@bunshin/capability-fortune';
import FortuneTodayPage from '../app/s/[serviceSlug]/today/page';
import { defaultFortuneAppearance } from '../src/fortune/appearance';
import {
  defaultFortuneGuide,
  defaultFortuneGuidanceSettings,
} from '../src/fortune/guidance-settings';

const state = vi.hoisted(() => ({
  page: vi.fn(),
  today: vi.fn(),
  history: vi.fn(),
  profile: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../src/fortune/page-context', () => ({ resolveFortunePage: state.page }));
vi.mock('../src/fortune/runtime', () => ({
  fortuneDailyReadingService: () => ({ today: state.today, history: state.history }),
}));
vi.mock('../src/fortune/personal-profile', () => ({
  fortunePersonalProfileRepository: () => ({ read: state.profile }),
}));

const renderToday = async () =>
  renderToStaticMarkup(
    await FortuneTodayPage({ params: Promise.resolve({ serviceSlug: 'tarot' }) }),
  );

const setting = {
  minimumAge: 18,
  aiEnabled: true,
  personalProfileEnabled: true,
  reflectionEnabled: true,
  guidanceSettings: {
    ...defaultFortuneGuidanceSettings,
    guideName: '月の案内役',
    guide: {
      ...defaultFortuneGuide,
      introduction: '今日の気持ちを整理しましょう。',
      imageUrl: 'https://images.example/guide.webp',
    },
  },
};

const service = {
  configuration: {
    brand: {
      logoUrl: 'https://images.example/fortune.jpg',
      primaryColor: '#000066',
      secondaryColor: '#ffc861',
    },
  },
};

const reading: FortuneReadingView = {
  id: 'today',
  localDate: toJapanLocalDate(new Date()),
  theme: 'WORK',
  cardCode: 'THE_FOOL',
  cardNameJa: '愚者',
  orientation: 'UPRIGHT',
  status: 'READY_AI',
  title: '新しい視点',
  body: '今日のカードから得られるヒントです。',
  actionStep: '気になることを一つ書く。',
  feedbackRating: null,
  feedbackIssue: null,
  createdAt: new Date(),
};

describe('fortune member home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.page.mockResolvedValue({ actor: { userId: 'reader' }, setting, service });
    state.today.mockResolvedValue({ participant: null, reading: null });
    state.profile.mockResolvedValue({
      enabled: true,
      completed: false,
      profile: emptyFortunePersonalProfile,
    });
    state.history.mockResolvedValue([]);
  });

  it('identifies the configurable AI guide and directs a first-time visitor to age confirmation', async () => {
    const markup = await renderToday();
    expect(markup).toContain('AI案内役');
    expect(markup).not.toContain('class="fortune-appearance"');
    expect(markup).toContain('月の案内役');
    expect(markup).toContain('今日の気持ちを整理しましょう。');
    expect(markup).toContain('images.example/guide.webp');
    expect(markup).toContain('年齢確認へ');
    expect(markup).not.toContain('name="interest"');
    expect(state.history).not.toHaveBeenCalled();
  });

  it('shows the optional service theme alongside the existing entry action', async () => {
    state.page.mockResolvedValue({
      actor: { userId: 'reader' },
      service,
      setting: {
        ...setting,
        guidanceSettings: {
          ...setting.guidanceSettings,
          appearance: { ...defaultFortuneAppearance, enabled: true, corners: 'square' },
        },
      },
    });
    const markup = await renderToday();
    expect(markup).toContain('class="fortune-appearance"');
    expect(markup).toContain('data-corners="square"');
    expect(markup).toContain('images.example/fortune.jpg');
    expect(markup).toContain('年齢確認へ');
  });

  it('offers optional intake to an age-confirmed participant and keeps single-reading entry available', async () => {
    state.today.mockResolvedValue({ participant: { id: 'participant' }, reading: null });
    const markup = await renderToday();
    expect(markup).toContain('はじめる');
    expect(markup).toContain('スキップ');
    expect(markup).toContain('何について占いますか？');
    expect(state.history).not.toHaveBeenCalled();
  });

  it('offers AI consultation before the card choices when intake is enabled', async () => {
    state.today.mockResolvedValue({ participant: { id: 'participant' }, reading: null });
    state.profile.mockResolvedValue({
      enabled: true,
      completed: true,
      profile: emptyFortunePersonalProfile,
    });
    state.page.mockResolvedValue({
      actor: { userId: 'reader' },
      service,
      setting: {
        ...setting,
        guidanceSettings: { ...setting.guidanceSettings, intake: { enabled: true } },
      },
    });
    const markup = await renderToday();
    expect(markup).toContain('今日の占い方を選ぶ');
    expect(markup).toContain('AIと相談を整理してから占う');
    expect(markup).toContain('カードを引いて占う');
    expect(markup.indexOf('AIと相談を整理してから占う')).toBeLessThan(
      markup.indexOf('カードを引いて占う'),
    );

    state.today.mockResolvedValue({ participant: { id: 'participant' }, reading });
    expect(await renderToday()).not.toContain('AIと相談を整理してから占う');
  });

  it('puts today’s result first and shows the optional previous reflection only after consent', async () => {
    state.today.mockResolvedValue({ participant: { id: 'participant' }, reading });
    state.profile.mockResolvedValue({
      enabled: true,
      completed: true,
      profile: { ...emptyFortunePersonalProfile, consented: true },
    });
    state.history.mockResolvedValue([
      {
        ...reading,
        id: 'previous',
        localDate: toJapanLocalDate(new Date(Date.now() - 86_400_000)),
        reflectionPrompt: '前回の行動で何に気づきましたか？',
      },
    ]);
    const markup = await renderToday();
    expect(markup).toContain('今日の鑑定を見る');
    expect(markup).toContain(reading.actionStep);
    expect(markup).toContain('前回の行動で何に気づきましたか？');
    expect(markup.indexOf(reading.actionStep!)).toBeLessThan(
      markup.indexOf('前回の提案を振り返る'),
    );
    expect(markup).not.toContain('何について占いますか？');
  });

  it('still shows age confirmation when AI is off and does not present an AI guide', async () => {
    state.page.mockResolvedValue({
      actor: { userId: 'reader' },
      service,
      setting: { ...setting, aiEnabled: false },
    });
    const markup = await renderToday();
    expect(markup).toContain('最初に年齢を確認します');
    expect(markup).not.toContain('月の案内役');
  });
});
