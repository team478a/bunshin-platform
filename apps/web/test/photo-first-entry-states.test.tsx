import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DailyActionSection,
  type DailyActionView,
  type PhotoFirstResult,
} from '../app/s/[serviceSlug]/bunshins/[bunshinId]/daily-action-section';

const photo: DailyActionView = {
  id: 'photo-1',
  type: 'PHOTO',
  text: '店頭に今日の商品を並べた写真',
  label: '写真',
  hasPhoto: true,
  attachmentStatus: 'READY',
  useForAutomaticImages: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const confirmationResult: PhotoFirstResult = {
  variant: { id: 'variant-1', dailyMissionId: 'mission-1', content: { body: '確認前の本文' } },
  photoFirst: {
    photoMemoryId: photo.id,
    analysis: {
      imageType: '手元写真',
      qualityNotes: [],
      uncertainElements: ['用紙の用途'],
      safetyFlags: [],
    },
    planning: {
      theme: '開店前の準備',
      angle: '確認作業を紹介する',
      recommendationReason: '店の姿勢が伝わるため',
      photoUsage: '手元の写真として使う',
      imageEditPrompt: null,
      confirmationQuestion: 'この用紙は公開してよい予定表ですか？',
    },
  },
};

function renderEntry(input: {
  todayMissionId?: string | null;
  photoFirstMissionSeed?: { missionDate: string; socialProfileId: string } | null;
}) {
  return renderToStaticMarkup(
    <DailyActionSection
      endpoint="/api/services/hassy/bunshins/bunshin-1/daily-actions"
      initialActions={[photo]}
      {...(input.todayMissionId === undefined ? {} : { todayMissionId: input.todayMissionId })}
      {...(input.photoFirstMissionSeed === undefined
        ? {}
        : { photoFirstMissionSeed: input.photoFirstMissionSeed })}
    />,
  );
}

describe('Photo First entry states', () => {
  it('offers Photo First when todays Mission already exists', () => {
    const html = renderEntry({ todayMissionId: 'mission-1' });

    expect(html).toContain('この写真から投稿を考える');
    expect(html).not.toContain('今日の投稿予定ができると');
  });

  it('offers Photo First when todays Mission can be created from a confirmed Plan', () => {
    const html = renderEntry({
      todayMissionId: null,
      photoFirstMissionSeed: {
        missionDate: '2026-10-01',
        socialProfileId: 'profile-1',
      },
    });

    expect(html).toContain('この写真から投稿を考える');
    expect(html).not.toContain('今日の投稿予定ができると');
  });

  it('explains why Photo First is unavailable when neither Mission nor Plan exists', () => {
    const html = renderEntry({ todayMissionId: null, photoFirstMissionSeed: null });

    expect(html).not.toContain('この写真から投稿を考える');
    expect(html).toContain('今日の投稿予定ができると、この写真から投稿を考えられます。');
    expect(html).toContain('daily-action__photo-first-waiting');
  });

  it('shows an answer form when the persisted Photo First plan needs confirmation', () => {
    const html = renderToStaticMarkup(
      <DailyActionSection
        endpoint="/api/services/hassy/bunshins/bunshin-1/daily-actions"
        initialActions={[photo]}
        initialPhotoFirstResult={confirmationResult}
        todayMissionId="mission-1"
      />,
    );

    expect(html).toContain('この用紙は公開してよい予定表ですか？');
    expect(html).toContain('name="confirmationAnswer"');
    expect(html).toContain('回答を反映して投稿案を見直す');
  });
});
